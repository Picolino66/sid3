import {
  BadGatewayException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { DriveIndexEntry, Prisma, Provider, ProviderIntegrationStatus } from '@prisma/client';
import { DriveFolderZipService, DriveZipPlan } from '../drive-index/drive-folder-zip.service';
import { hasDriveFullReadScope } from '../drive-index/drive-index-scopes';
import { PrismaService } from '../prisma/prisma.service';
import { DriveFileContent, StorageProviderIntegrationCredentials } from '../storage-providers/dto/storage-provider.types';
import {
  GOOGLE_WORKSPACE_EXPORT_FORMATS,
  GoogleDriveStorageProvider,
  isDriveFileDownloadable
} from '../storage-providers/google-drive-storage.provider';
import {
  PublicFolderCrumbDto,
  PublicFolderListResponseDto,
  PublicSearchItemDto,
  PublicSearchResponseDto,
  PublicShareItemDto,
  PublicShareResponseDto
} from './dto/public-share-response.dto';
import { parseByteRange, publicPreviewKind } from './public-media';
import { hashShareLinkToken, isWellFormedShareLinkToken } from './share-link-token';

export type PublicZip = { credentials: StorageProviderIntegrationCredentials; plan: DriveZipPlan; zipName: string };

/** Resultado de uma pré-visualização: o conteúdo, ou "intervalo fora do arquivo" (HTTP 416). */
export type PublicMediaResult =
  | { kind: 'content'; content: DriveFileContent }
  | { kind: 'unsatisfiable'; sizeBytes: number };

type PublicItemFields = Pick<
  DriveIndexEntry,
  'providerFileId' | 'name' | 'mimeType' | 'isFolder' | 'isSharedDrive' | 'sizeBytes' | 'modifiedTime'
>;

const FOLDER_PAGE_SIZE = 100;
const COMBINING_MARKS_PATTERN = '[\u0300-\u036f]';

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const SEARCH_PAGE_SIZE = 50;
const MAX_ANCESTOR_DEPTH = 50;
const ITEM_NOT_FOUND = 'Item não encontrado neste link';

type ResolvedShare = {
  id: string;
  name: string | null;
  createdAt: Date;
  expiresAt: Date | null;
  sharedBy: string | null;
  sharedFileIds: Set<string>;
  connection: {
    id: string;
    provider: Provider;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: Date | null;
  };
};

/**
 * Acesso anônimo a um link público. Toda leitura valida que o item pedido é um dos itens
 * compartilhados ou está dentro de uma pasta/drive compartilhado — nada fora disso é exposto.
 */
@Injectable()
export class PublicSharesService {
  private readonly logger = new Logger(PublicSharesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveProvider: GoogleDriveStorageProvider,
    private readonly folderZipService: DriveFolderZipService
  ) {}

  async getShare(token: string): Promise<PublicShareResponseDto> {
    const share = await this.resolveShare(token);

    const entries = await this.prisma.driveIndexEntry.findMany({
      where: { providerIntegrationId: share.connection.id, providerFileId: { in: [...share.sharedFileIds] } },
      orderBy: [{ isFolder: 'desc' }, { name: 'asc' }]
    });

    await this.prisma.shareLink.update({
      where: { id: share.id },
      data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() }
    });

    return {
      name: share.name,
      sharedBy: share.sharedBy,
      createdAt: share.createdAt.toISOString(),
      expiresAt: share.expiresAt?.toISOString() ?? null,
      items: entries.map((entry) => this.toPublicItem(entry))
    };
  }

  async listFolder(token: string, folderId: string, page = 1): Promise<PublicFolderListResponseDto> {
    const share = await this.resolveShare(token);
    const path = await this.resolveAccessiblePath(share, folderId);
    const folder = path[path.length - 1]!;

    if (!folder.isFolder) {
      throw new UnprocessableEntityException('O item não é uma pasta');
    }

    const where = { providerIntegrationId: share.connection.id, parentFileId: folder.providerFileId };
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.driveIndexEntry.findMany({
        where,
        orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * FOLDER_PAGE_SIZE,
        take: FOLDER_PAGE_SIZE
      }),
      this.prisma.driveIndexEntry.count({ where })
    ]);

    return {
      folder: this.toCrumb(folder),
      breadcrumb: path.map((entry) => this.toCrumb(entry)),
      items: entries.map((entry) => this.toPublicItem(entry)),
      total,
      page,
      pageSize: FOLDER_PAGE_SIZE
    };
  }

  async downloadFile(token: string, fileId: string): Promise<DriveFileContent> {
    const share = await this.resolveShare(token);
    const path = await this.resolveAccessiblePath(share, fileId);
    const file = path[path.length - 1]!;

    if (file.isFolder) {
      throw new UnprocessableEntityException('Pastas não podem ser baixadas; abra a pasta e baixe os arquivos.');
    }
    if (!isDriveFileDownloadable(file.mimeType)) {
      throw new UnprocessableEntityException('Este tipo de arquivo não pode ser baixado.');
    }

    this.logger.log(`Public download link=${share.id.slice(0, 8)} file=${file.providerFileId.slice(0, 8)}`);

    try {
      return await this.driveProvider.downloadDriveFile(share.connection, {
        providerFileId: file.providerFileId,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes === null ? null : Number(file.sizeBytes)
      });
    } catch (error) {
      // O detalhe do Google (tokens, e-mails, IDs) fica no log; o visitante anônimo recebe mensagem genérica.
      this.logger.warn(
        `Public download failed link=${share.id.slice(0, 8)} reason=${error instanceof Error ? error.message : 'unknown_error'}`
      );
      throw new BadGatewayException('Não foi possível obter este arquivo do Google Drive agora. Tente novamente mais tarde.');
    }
  }

  /**
   * Conteúdo de imagem, vídeo ou áudio para tocar no navegador. Repassa o header Range ao Google,
   * o que permite avançar o vídeo sem baixar tudo.
   */
  async streamMedia(token: string, fileId: string, rangeHeader?: string): Promise<PublicMediaResult> {
    const share = await this.resolveShare(token);
    const path = await this.resolveAccessiblePath(share, fileId);
    const file = path[path.length - 1]!;

    if (!publicPreviewKind(file.mimeType, file.isFolder)) {
      throw new UnprocessableEntityException('Este item não pode ser visualizado no navegador; baixe o arquivo.');
    }

    const sizeBytes = file.sizeBytes === null ? null : Number(file.sizeBytes);
    const range = parseByteRange(rangeHeader, sizeBytes);
    if (range.kind === 'unsatisfiable') {
      return { kind: 'unsatisfiable', sizeBytes: sizeBytes ?? 0 };
    }
    // O player pede vários intervalos ao avançar; registra só o início da reprodução.
    if (range.kind === 'full' || range.start === 0) {
      this.logger.log(`Public preview link=${share.id.slice(0, 8)} file=${file.providerFileId.slice(0, 8)}`);
    }

    try {
      const content = await this.driveProvider.downloadDriveFile(
        share.connection,
        { providerFileId: file.providerFileId, name: file.name, mimeType: file.mimeType, sizeBytes },
        range.kind === 'range' ? { range: range.header } : {}
      );
      return { kind: 'content', content };
    } catch (error) {
      this.logger.warn(
        `Public preview failed link=${share.id.slice(0, 8)} reason=${error instanceof Error ? error.message : 'unknown_error'}`
      );
      throw new BadGatewayException('Não foi possível obter este arquivo do Google Drive agora. Tente novamente mais tarde.');
    }
  }

  /**
   * Busca por nome em todos os itens do link, incluindo o conteúdo das pastas compartilhadas.
   * A árvore é montada no banco a partir dos itens do link, então nada fora deles aparece.
   */
  async search(token: string, query: string, page = 1): Promise<PublicSearchResponseDto> {
    const share = await this.resolveShare(token);
    // Busca sem diferenciar acentos: o Google costuma devolver nomes com acentos decompostos (NFD).
    const normalizedQuery = stripAccents(query);
    const pattern = `%${normalizedQuery.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const tree = Prisma.sql`
      WITH RECURSIVE tree AS (
        SELECT e.provider_file_id, e.name, e.parent_file_id, ARRAY[]::text[] AS path, NULL::text AS parent_in_share, 0 AS depth
        FROM drive_index_entries e
        WHERE e.provider_integration_id = ${share.connection.id}::uuid
          AND e.provider_file_id = ANY(${[...share.sharedFileIds]}::text[])
        UNION ALL
        SELECT c.provider_file_id, c.name, c.parent_file_id, t.path || t.name, t.provider_file_id, t.depth + 1
        FROM drive_index_entries c
        JOIN tree t ON c.parent_file_id = t.provider_file_id
        WHERE c.provider_integration_id = ${share.connection.id}::uuid AND t.depth < ${MAX_ANCESTOR_DEPTH}
      ),
      matches AS (
        SELECT DISTINCT ON (provider_file_id) provider_file_id, path, parent_in_share
        FROM tree
        WHERE regexp_replace(normalize(name, NFD), ${COMBINING_MARKS_PATTERN}, '', 'g') ILIKE ${pattern}
        ORDER BY provider_file_id, depth
      )`;

    const [countRow] = await this.prisma.$queryRaw<{ total: bigint }[]>`${tree} SELECT COUNT(*)::bigint AS total FROM matches`;
    const rows = await this.prisma.$queryRaw<(PublicItemFields & { path: string[]; parentInShare: string | null })[]>`
      ${tree}
      SELECT e.provider_file_id AS "providerFileId", e.name, e.mime_type AS "mimeType", e.is_folder AS "isFolder",
             e.is_shared_drive AS "isSharedDrive", e.size_bytes AS "sizeBytes", e.modified_time AS "modifiedTime",
             m.path, m.parent_in_share AS "parentInShare"
      FROM matches m
      JOIN drive_index_entries e
        ON e.provider_integration_id = ${share.connection.id}::uuid AND e.provider_file_id = m.provider_file_id
      ORDER BY e.is_folder DESC, e.name ASC
      LIMIT ${SEARCH_PAGE_SIZE} OFFSET ${(page - 1) * SEARCH_PAGE_SIZE}`;

    return {
      query,
      items: rows.map(
        (row): PublicSearchItemDto => ({ ...this.toPublicItem(row), path: row.path, parentId: row.parentInShare })
      ),
      total: Number(countRow?.total ?? 0),
      page,
      pageSize: SEARCH_PAGE_SIZE
    };
  }

  /** ZIP de uma pasta do link (compartilhada ou dentro de uma pasta/drive compartilhado). */
  async prepareFolderZip(token: string, folderId: string): Promise<PublicZip> {
    const share = await this.resolveShare(token);
    const path = await this.resolveAccessiblePath(share, folderId);
    const folder = path[path.length - 1]!;

    if (!folder.isFolder) {
      throw new UnprocessableEntityException('Somente pastas podem ser baixadas em ZIP.');
    }

    const plan = await this.folderZipService.buildPlan(share.connection.id, [folder]);
    this.logger.log(`Public folder zip link=${share.id.slice(0, 8)} files=${plan.fileCount}`);
    return { credentials: share.connection, plan, zipName: `${this.folderZipService.sanitizeName(folder.name)}.zip` };
  }

  /** ZIP com todos os itens do link ("Baixar tudo"). */
  async prepareShareZip(token: string): Promise<PublicZip> {
    const share = await this.resolveShare(token);
    const roots = await this.prisma.driveIndexEntry.findMany({
      where: { providerIntegrationId: share.connection.id, providerFileId: { in: [...share.sharedFileIds] } }
    });

    const plan = await this.folderZipService.buildPlan(share.connection.id, roots);
    this.logger.log(`Public share zip link=${share.id.slice(0, 8)} files=${plan.fileCount}`);
    const baseName = share.name ? this.folderZipService.sanitizeName(share.name) : 'arquivos-compartilhados';
    return { credentials: share.connection, plan, zipName: `${baseName}.zip` };
  }

  private async resolveShare(token: string): Promise<ResolvedShare> {
    if (!isWellFormedShareLinkToken(token)) {
      throw new NotFoundException('Link não encontrado');
    }

    const link = await this.prisma.shareLink.findUnique({
      where: { tokenHash: hashShareLinkToken(token) },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
        owner: { select: { name: true } },
        items: { select: { providerFileId: true } },
        providerIntegration: {
          select: {
            id: true,
            provider: true,
            status: true,
            scopes: true,
            encryptedAccessToken: true,
            encryptedRefreshToken: true,
            tokenExpiresAt: true
          }
        }
      }
    });

    if (!link) {
      throw new NotFoundException('Link não encontrado');
    }
    if (link.revokedAt) {
      throw new GoneException('Este link foi desativado por quem o compartilhou');
    }
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('Este link expirou');
    }

    const connection = link.providerIntegration;
    if (connection.status !== ProviderIntegrationStatus.CONNECTED || !hasDriveFullReadScope(connection.scopes)) {
      throw new ServiceUnavailableException('Os arquivos deste link estão indisponíveis no momento');
    }

    return {
      id: link.id,
      name: link.name,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      sharedBy: link.owner.name,
      sharedFileIds: new Set(link.items.map((item) => item.providerFileId)),
      connection
    };
  }

  /**
   * Sobe pelos pais do item até encontrar um item compartilhado. Devolve o caminho do item
   * compartilhado até o item pedido; se a subida termina sem encontrá-lo, o item não pertence ao link.
   */
  private async resolveAccessiblePath(share: ResolvedShare, fileId: string): Promise<DriveIndexEntry[]> {
    const path: DriveIndexEntry[] = [];
    let currentId: string | null = fileId;

    while (currentId && path.length < MAX_ANCESTOR_DEPTH) {
      const entry: DriveIndexEntry | null = await this.prisma.driveIndexEntry.findUnique({
        where: {
          providerIntegrationId_providerFileId: { providerIntegrationId: share.connection.id, providerFileId: currentId }
        }
      });

      if (!entry) {
        break;
      }

      path.unshift(entry);
      if (share.sharedFileIds.has(entry.providerFileId)) {
        return path;
      }
      currentId = entry.parentFileId;
    }

    throw new NotFoundException(ITEM_NOT_FOUND);
  }

  private toPublicItem(entry: PublicItemFields): PublicShareItemDto {
    return {
      id: entry.providerFileId,
      name: entry.name,
      mimeType: entry.mimeType,
      isFolder: entry.isFolder,
      isSharedDrive: entry.isSharedDrive,
      sizeBytes: entry.sizeBytes === null ? null : Number(entry.sizeBytes),
      modifiedTime: entry.modifiedTime?.toISOString() ?? null,
      downloadable: !entry.isFolder && isDriveFileDownloadable(entry.mimeType),
      exportExtension: GOOGLE_WORKSPACE_EXPORT_FORMATS[entry.mimeType]?.extension ?? null,
      previewKind: publicPreviewKind(entry.mimeType, entry.isFolder)
    };
  }

  private toCrumb(entry: DriveIndexEntry): PublicFolderCrumbDto {
    return { id: entry.providerFileId, name: entry.name };
  }
}
