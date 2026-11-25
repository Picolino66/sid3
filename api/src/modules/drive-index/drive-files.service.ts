import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { DriveIndexEntry, Prisma, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriveFileContent, StorageProviderIntegrationCredentials } from '../storage-providers/dto/storage-provider.types';
import {
  GOOGLE_WORKSPACE_EXPORT_FORMATS,
  GoogleDriveStorageProvider,
  isDriveFileDownloadable
} from '../storage-providers/google-drive-storage.provider';
import { DriveFolderZipService, DriveZipPlan } from './drive-folder-zip.service';
import { hasDriveFullReadScope } from './drive-index-scopes';
import { DriveFileListResponseDto, DriveFileListSection, DriveFolderCrumbDto } from './dto/drive-file-list-response.dto';
import { DriveFileResponseDto } from './dto/drive-file-response.dto';
import { ListDriveFilesQueryDto } from './dto/list-drive-files-query.dto';

export const DRIVE_ROOT_PARENT = 'root';
export const DRIVE_SHARED_PARENT = 'shared';
export const DRIVE_SHARED_DRIVES_PARENT = 'shared-drives';

const DEFAULT_PAGE_SIZE = 50;
const MAX_BREADCRUMB_DEPTH = 50;

/** Consulta o índice local do Drive e faz o download sob demanda a partir do Google Drive. */
@Injectable()
export class DriveFilesService {
  private readonly logger = new Logger(DriveFilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveProvider: GoogleDriveStorageProvider,
    private readonly folderZipService: DriveFolderZipService
  ) {}

  async listFiles(
    userId: string,
    connectionId: string,
    query: ListDriveFilesQueryDto
  ): Promise<DriveFileListResponseDto> {
    const connection = await this.findOwnedConnection(userId, connectionId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const search = query.q?.trim();
    const parentId = search ? null : (query.parentId ?? DRIVE_ROOT_PARENT);

    const where: Prisma.DriveIndexEntryWhereInput = { providerIntegrationId: connection.id };
    let section: DriveFileListSection;
    if (search) {
      section = 'search';
      where.name = { contains: search, mode: 'insensitive' };
    } else if (parentId === DRIVE_SHARED_PARENT) {
      section = 'shared-with-me';
      where.parentFileId = null;
      where.isSharedDrive = false;
    } else if (parentId === DRIVE_SHARED_DRIVES_PARENT) {
      section = 'shared-drives';
      where.isSharedDrive = true;
    } else if (parentId === DRIVE_ROOT_PARENT) {
      section = 'my-drive';
      if (!connection.driveIndexRootFolderId) {
        return { items: [], total: 0, page, pageSize, parentId, section, breadcrumb: [] };
      }
      where.parentFileId = connection.driveIndexRootFolderId;
    } else {
      section = 'shared-with-me'; // refinado por locateFolder abaixo
      where.parentFileId = parentId;
    }
    const isFolderListing = !search && parentId !== null && ![DRIVE_ROOT_PARENT, DRIVE_SHARED_PARENT, DRIVE_SHARED_DRIVES_PARENT].includes(parentId);

    const [entries, total] = await this.prisma.$transaction([
      this.prisma.driveIndexEntry.findMany({
        where,
        orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.driveIndexEntry.count({ where })
    ]);

    let breadcrumb: DriveFolderCrumbDto[] = [];
    if (isFolderListing && parentId) {
      const location = await this.locateFolder(connection.id, parentId, connection.driveIndexRootFolderId);
      breadcrumb = location.breadcrumb;
      section = location.section;
    }

    return {
      items: entries.map((entry) => this.toResponse(entry)),
      total,
      page,
      pageSize,
      parentId,
      section,
      breadcrumb
    };
  }

  async getFile(userId: string, connectionId: string, fileId: string): Promise<DriveFileResponseDto> {
    const connection = await this.findOwnedConnection(userId, connectionId);
    return this.toResponse(await this.findEntry(connection.id, fileId));
  }

  async downloadFile(userId: string, connectionId: string, fileId: string): Promise<DriveFileContent> {
    const connection = await this.findOwnedConnection(userId, connectionId);
    this.assertCanDownload(connection);

    const entry = await this.findEntry(connection.id, fileId);
    if (entry.isFolder) {
      throw new UnprocessableEntityException('Para pastas, use o download em ZIP.');
    }
    if (!isDriveFileDownloadable(entry.mimeType)) {
      throw new UnprocessableEntityException(`Arquivos do tipo ${entry.mimeType} não podem ser baixados.`);
    }

    this.logger.log(`Drive file download connection=${this.maskId(connection.id)} file=${this.maskId(entry.providerFileId)}`);

    return this.driveProvider.downloadDriveFile(connection, {
      providerFileId: entry.providerFileId,
      name: entry.name,
      mimeType: entry.mimeType,
      sizeBytes: entry.sizeBytes === null ? null : Number(entry.sizeBytes)
    });
  }

  /** Valida a pasta e monta o plano do ZIP; o streaming fica com o controller. */
  async prepareFolderZip(
    userId: string,
    connectionId: string,
    folderId: string
  ): Promise<{ credentials: StorageProviderIntegrationCredentials; plan: DriveZipPlan; zipName: string }> {
    const connection = await this.findOwnedConnection(userId, connectionId);
    this.assertCanDownload(connection);

    const folder = await this.findEntry(connection.id, folderId);
    if (!folder.isFolder) {
      throw new UnprocessableEntityException('Somente pastas podem ser baixadas em ZIP; use o download do arquivo.');
    }

    const plan = await this.folderZipService.buildPlan(connection.id, [folder]);
    this.logger.log(
      `Drive folder zip connection=${this.maskId(connection.id)} folder=${this.maskId(folder.providerFileId)} files=${plan.fileCount}`
    );

    return { credentials: connection, plan, zipName: `${this.folderZipService.sanitizeName(folder.name)}.zip` };
  }

  private assertCanDownload(connection: { status: ProviderIntegrationStatus; scopes: string[] }): void {
    if (connection.status !== ProviderIntegrationStatus.CONNECTED) {
      throw new ConflictException('A conexão não está ativa. Reconecte o Google Drive para baixar arquivos.');
    }
    if (!hasDriveFullReadScope(connection.scopes)) {
      throw new ForbiddenException('A conexão não tem permissão de leitura do Drive inteiro. Reconecte a conta.');
    }
  }

  private async findOwnedConnection(userId: string, connectionId: string) {
    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: {
        id: true,
        provider: true,
        status: true,
        scopes: true,
        encryptedAccessToken: true,
        encryptedRefreshToken: true,
        tokenExpiresAt: true,
        driveIndexRootFolderId: true
      }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    return connection;
  }

  private async findEntry(connectionId: string, fileId: string): Promise<DriveIndexEntry> {
    const entry = await this.prisma.driveIndexEntry.findUnique({
      where: { providerIntegrationId_providerFileId: { providerIntegrationId: connectionId, providerFileId: fileId } }
    });

    if (!entry) {
      throw new NotFoundException('Arquivo não encontrado no índice. Atualize a indexação do Drive.');
    }

    return entry;
  }

  /**
   * Sobe pelos pais da pasta para montar o caminho e descobrir em que seção ela está:
   * termina na raiz do Meu Drive, num drive compartilhado ou num item compartilhado sem pai visível.
   */
  private async locateFolder(
    connectionId: string,
    folderId: string,
    rootFolderId: string | null
  ): Promise<{ breadcrumb: DriveFolderCrumbDto[]; section: DriveFileListSection }> {
    const breadcrumb: DriveFolderCrumbDto[] = [];
    let currentId: string | null = folderId;
    let section: DriveFileListSection = 'shared-with-me';

    while (currentId && breadcrumb.length < MAX_BREADCRUMB_DEPTH) {
      if (currentId === rootFolderId) {
        section = 'my-drive';
        break;
      }

      const folder: { providerFileId: string; name: string; parentFileId: string | null; isSharedDrive: boolean } | null =
        await this.prisma.driveIndexEntry.findUnique({
          where: { providerIntegrationId_providerFileId: { providerIntegrationId: connectionId, providerFileId: currentId } },
          select: { providerFileId: true, name: true, parentFileId: true, isSharedDrive: true }
        });

      if (!folder) {
        break;
      }

      breadcrumb.unshift({ id: folder.providerFileId, name: folder.name });
      if (folder.isSharedDrive) {
        section = 'shared-drives';
        break;
      }
      currentId = folder.parentFileId;
    }

    return { breadcrumb, section };
  }

  private toResponse(entry: DriveIndexEntry): DriveFileResponseDto {
    return {
      id: entry.providerFileId,
      parentId: entry.parentFileId,
      driveId: entry.driveId,
      isSharedDrive: entry.isSharedDrive,
      name: entry.name,
      mimeType: entry.mimeType,
      isFolder: entry.isFolder,
      sizeBytes: entry.sizeBytes === null ? null : Number(entry.sizeBytes),
      md5Checksum: entry.md5Checksum,
      modifiedTime: entry.modifiedTime?.toISOString() ?? null,
      webViewLink: entry.webViewLink,
      downloadable: !entry.isFolder && isDriveFileDownloadable(entry.mimeType),
      exportExtension: GOOGLE_WORKSPACE_EXPORT_FORMATS[entry.mimeType]?.extension ?? null,
      indexedAt: entry.indexedAt.toISOString()
    };
  }

  private maskId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  }
}
