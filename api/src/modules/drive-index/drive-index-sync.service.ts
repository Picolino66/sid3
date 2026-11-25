import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap
} from '@nestjs/common';
import { DriveIndexStatus, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DriveIndexedFile,
  DriveSharedDrive,
  StorageProviderIntegrationCredentials
} from '../storage-providers/dto/storage-provider.types';
import {
  DRIVE_FOLDER_MIME_TYPE,
  DriveChangesTokenExpiredError,
  GoogleDriveStorageProvider,
  isDriveFolderMimeType
} from '../storage-providers/google-drive-storage.provider';
import { hasDriveFullReadScope } from './drive-index-scopes';
import { DriveIndexStatusResponseDto } from './dto/drive-index-status-response.dto';
import { DriveIndexRefreshMode } from './dto/refresh-drive-index-request.dto';

type IndexableConnection = StorageProviderIntegrationCredentials & {
  id: string;
  driveIndexChangesToken: string | null;
  driveIndexRootFolderId: string | null;
};

const STALE_INDEXING_LOCK_MS = 30 * 60 * 1000;
const UPSERT_BATCH_SIZE = 200;
/** Quantas pastas são listadas em paralelo ao percorrer pastas compartilhadas comigo. */
const SHARED_FOLDER_CRAWL_CONCURRENCY = 6;
const MAX_ERROR_LENGTH = 500;

/**
 * Mantém o índice local dos arquivos de cada conexão Google Drive.
 * A primeira indexação faz a varredura completa; as seguintes aplicam só as mudanças (Changes API).
 */
@Injectable()
export class DriveIndexSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DriveIndexSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driveProvider: GoogleDriveStorageProvider
  ) {}

  /** Uma indexação interrompida por reinício do servidor não pode ficar presa como INDEXING. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.prisma.providerIntegration.updateMany({
        where: { driveIndexStatus: DriveIndexStatus.INDEXING },
        data: {
          driveIndexStatus: DriveIndexStatus.FAILED,
          driveIndexStartedAt: null,
          driveIndexLastError: 'Indexação interrompida pelo reinício do servidor'
        }
      });
      if (result.count > 0) {
        this.logger.warn(`Marked ${result.count} interrupted drive index run(s) as FAILED`);
      }
    } catch (error) {
      this.logger.error(`Failed to reset interrupted drive index runs: ${this.describeError(error)}`);
    }
  }

  async getStatus(userId: string, connectionId: string): Promise<DriveIndexStatusResponseDto> {
    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: {
        id: true,
        scopes: true,
        driveIndexStatus: true,
        driveIndexStartedAt: true,
        driveIndexedAt: true,
        driveIndexItemCount: true,
        driveIndexLastError: true
      }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    return {
      connectionId: connection.id,
      status: connection.driveIndexStatus,
      hasReadScope: hasDriveFullReadScope(connection.scopes),
      startedAt: connection.driveIndexStartedAt?.toISOString() ?? null,
      lastIndexedAt: connection.driveIndexedAt?.toISOString() ?? null,
      itemCount: connection.driveIndexItemCount,
      lastError: connection.driveIndexLastError
    };
  }

  /**
   * Agenda uma atualização do índice em segundo plano e devolve o status atual.
   * Se já houver uma indexação em andamento para a conexão, apenas devolve o status dela.
   */
  async requestRefresh(
    userId: string,
    connectionId: string,
    mode: DriveIndexRefreshMode = 'incremental'
  ): Promise<DriveIndexStatusResponseDto> {
    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: { id: true, status: true, scopes: true }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    if (connection.status !== ProviderIntegrationStatus.CONNECTED) {
      throw new ConflictException('A conexão não está ativa. Reconecte o Google Drive para indexar os arquivos.');
    }

    if (!hasDriveFullReadScope(connection.scopes)) {
      throw new ForbiddenException(
        'A conexão não tem permissão de leitura do Drive inteiro. Clique em "Reconectar" e autorize o acesso de leitura.'
      );
    }

    if (await this.acquireIndexingLock(connection.id)) {
      this.logger.log(`Drive index refresh scheduled connection=${this.maskId(connection.id)} mode=${mode}`);
      void this.runIndexing(connection.id, mode);
    }

    return this.getStatus(userId, connectionId);
  }

  /** Executa a indexação; nunca lança — o resultado fica registrado na conexão. */
  async runIndexing(connectionId: string, mode: DriveIndexRefreshMode): Promise<void> {
    const startedAt = Date.now();

    try {
      const connection = await this.prisma.providerIntegration.findUniqueOrThrow({
        where: { id: connectionId },
        select: {
          id: true,
          provider: true,
          encryptedAccessToken: true,
          encryptedRefreshToken: true,
          tokenExpiresAt: true,
          driveIndexChangesToken: true,
          driveIndexRootFolderId: true
        }
      });

      let effectiveMode = mode;
      if (mode === 'incremental' && connection.driveIndexChangesToken) {
        try {
          await this.applyIncrementalChanges(connection, connection.driveIndexChangesToken);
        } catch (error) {
          if (!(error instanceof DriveChangesTokenExpiredError)) {
            throw error;
          }
          this.logger.warn(`Changes token expired connection=${this.maskId(connectionId)}; running full scan`);
          effectiveMode = 'full';
          await this.runFullScan(connection);
        }
      } else {
        effectiveMode = 'full';
        await this.runFullScan(connection);
      }

      const itemCount = await this.prisma.driveIndexEntry.count({ where: { providerIntegrationId: connectionId } });
      await this.prisma.providerIntegration.update({
        where: { id: connectionId },
        data: {
          driveIndexStatus: DriveIndexStatus.READY,
          driveIndexStartedAt: null,
          driveIndexedAt: new Date(),
          driveIndexItemCount: itemCount,
          driveIndexLastError: null
        }
      });

      this.logger.log(
        `Drive index ${effectiveMode} finished connection=${this.maskId(connectionId)} items=${itemCount} durationMs=${Date.now() - startedAt}`
      );
    } catch (error) {
      const message = this.describeError(error);
      this.logger.error(`Drive index failed connection=${this.maskId(connectionId)} reason=${message}`);
      await this.prisma.providerIntegration
        .update({
          where: { id: connectionId },
          data: {
            driveIndexStatus: DriveIndexStatus.FAILED,
            driveIndexStartedAt: null,
            driveIndexLastError: message.slice(0, MAX_ERROR_LENGTH)
          }
        })
        .catch((updateError: unknown) =>
          this.logger.error(`Failed to record drive index failure: ${this.describeError(updateError)}`)
        );
    }
  }

  /**
   * Varredura completa de "Meu Drive", "Compartilhados comigo" e de cada drive compartilhado.
   * O token de mudanças é obtido ANTES da listagem para que nada alterado durante a varredura
   * se perca na próxima atualização incremental.
   */
  private async runFullScan(connection: IndexableConnection): Promise<void> {
    const scanStartedAt = new Date();
    const changesToken = await this.driveProvider.getChangesStartPageToken(connection);
    const rootFolderId = await this.driveProvider.getRootFolderId(connection);

    await this.scanFiles(connection);

    let drivesPageToken: string | null = null;
    do {
      const page = await this.driveProvider.listSharedDrivesPage(connection, drivesPageToken);
      for (const sharedDrive of page.drives) {
        await this.upsertSharedDrive(connection.id, sharedDrive);
        await this.scanFiles(connection, sharedDrive.driveId);
      }
      drivesPageToken = page.nextPageToken;
    } while (drivesPageToken);

    // Depois dos drives compartilhados, para já saber de quais drives a conta é membro.
    await this.crawlFoldersSharedWithMe(connection);

    // Tudo que não foi visto nesta varredura saiu do Drive (excluído, ou acesso removido).
    await this.prisma.driveIndexEntry.deleteMany({
      where: { providerIntegrationId: connection.id, indexedAt: { lt: scanStartedAt } }
    });

    await this.prisma.providerIntegration.update({
      where: { id: connection.id },
      data: { driveIndexChangesToken: changesToken, driveIndexRootFolderId: rootFolderId }
    });
  }

  /** Indexa todas as páginas de um corpus: o do usuário (sem driveId) ou o de um drive compartilhado. */
  private async scanFiles(connection: IndexableConnection, driveId?: string): Promise<void> {
    let pageToken: string | null = null;
    do {
      const page = await this.driveProvider.listFilesPage(connection, pageToken, driveId);
      await this.upsertEntries(connection.id, page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
  }

  private async applyIncrementalChanges(connection: IndexableConnection, startToken: string): Promise<void> {
    let pageToken = startToken;
    let newStartPageToken: string | null = null;

    while (!newStartPageToken) {
      const page = await this.driveProvider.listChangesPage(connection, pageToken);

      const fileChanges = page.changes.flatMap((change) => (change.kind === 'file' ? [change] : []));
      const updatedFiles = fileChanges.flatMap((change) => (!change.removed && change.file ? [change.file] : []));
      const removedIds = fileChanges.filter((change) => change.removed).map((change) => change.providerFileId);

      await this.upsertEntries(connection.id, updatedFiles);
      await this.removeEntries(connection.id, removedIds);

      for (const change of page.changes) {
        if (change.kind !== 'drive') {
          continue;
        }
        if (change.removed || !change.drive) {
          await this.removeSharedDrive(connection.id, change.driveId);
        } else {
          await this.applySharedDriveChange(connection, change.drive);
        }
      }

      if (page.nextPageToken) {
        pageToken = page.nextPageToken;
      } else {
        newStartPageToken = page.newStartPageToken ?? pageToken;
      }
    }

    // A Changes API não informa o que muda dentro de pastas de outras pessoas; elas são relidas.
    await this.crawlFoldersSharedWithMe(connection);

    const rootFolderId = connection.driveIndexRootFolderId ?? (await this.driveProvider.getRootFolderId(connection));
    await this.prisma.providerIntegration.update({
      where: { id: connection.id },
      data: { driveIndexChangesToken: newStartPageToken, driveIndexRootFolderId: rootFolderId }
    });
  }

  /**
   * Percorre, listando o conteúdo pelo pai, as pastas compartilhadas comigo: pastas de outras pessoas
   * e pastas de drives compartilhados dos quais a conta não é membro. A listagem do corpus "user" não
   * traz o conteúdo delas, só o que o usuário já abriu.
   * O que o índice tinha numa pasta e o Google não devolveu mais saiu dela e é removido.
   */
  private async crawlFoldersSharedWithMe(connection: IndexableConnection): Promise<void> {
    const memberDrives = await this.prisma.driveIndexEntry.findMany({
      where: { providerIntegrationId: connection.id, isSharedDrive: true },
      select: { providerFileId: true }
    });
    const roots = await this.prisma.driveIndexEntry.findMany({
      where: {
        providerIntegrationId: connection.id,
        isFolder: true,
        isSharedDrive: false,
        OR: [
          { driveId: null, ownedByMe: false },
          { driveId: { not: null, notIn: memberDrives.map((drive) => drive.providerFileId) } }
        ]
      },
      select: { providerFileId: true }
    });

    const visited = new Set<string>();
    const pending = roots.map((root) => root.providerFileId);
    let itemCount = 0;

    while (pending.length > 0) {
      const folderIds = [...new Set(pending.splice(0, SHARED_FOLDER_CRAWL_CONCURRENCY))].filter((id) => !visited.has(id));
      if (folderIds.length === 0) {
        continue;
      }
      folderIds.forEach((id) => visited.add(id));

      const listings = await Promise.all(folderIds.map((folderId) => this.listAllChildren(connection, folderId)));
      const children = listings.flat();

      await this.upsertEntries(connection.id, children);
      itemCount += children.length;

      const returnedIds = new Set(children.map((child) => child.providerFileId));
      const indexedChildren = await this.prisma.driveIndexEntry.findMany({
        where: { providerIntegrationId: connection.id, parentFileId: { in: folderIds } },
        select: { providerFileId: true }
      });
      const goneIds = indexedChildren.map((child) => child.providerFileId).filter((id) => !returnedIds.has(id));
      await this.removeEntries(connection.id, goneIds);

      for (const child of children) {
        if (isDriveFolderMimeType(child.mimeType) && !visited.has(child.providerFileId)) {
          pending.push(child.providerFileId);
        }
      }
    }

    if (visited.size > 0) {
      this.logger.log(
        `Shared-with-me folders crawled connection=${this.maskId(connection.id)} folders=${visited.size} items=${itemCount}`
      );
    }
  }

  private async listAllChildren(connection: IndexableConnection, folderId: string): Promise<DriveIndexedFile[]> {
    const children: DriveIndexedFile[] = [];
    let pageToken: string | null = null;
    do {
      const page = await this.driveProvider.listFolderChildrenPage(connection, folderId, pageToken);
      children.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return children;
  }

  private async upsertEntries(connectionId: string, files: DriveIndexedFile[]): Promise<void> {
    for (let start = 0; start < files.length; start += UPSERT_BATCH_SIZE) {
      const batch = files.slice(start, start + UPSERT_BATCH_SIZE);
      const indexedAt = new Date();

      await this.prisma.$transaction(
        batch.map((file) => {
          const fields = {
            parentFileId: file.parentFileId,
            driveId: file.driveId,
            isSharedDrive: false,
            name: file.name,
            mimeType: file.mimeType,
            isFolder: isDriveFolderMimeType(file.mimeType),
            sizeBytes: file.sizeBytes,
            md5Checksum: file.md5Checksum,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink,
            ownedByMe: file.ownedByMe,
            indexedAt
          };

          return this.prisma.driveIndexEntry.upsert({
            where: {
              providerIntegrationId_providerFileId: {
                providerIntegrationId: connectionId,
                providerFileId: file.providerFileId
              }
            },
            create: { providerIntegrationId: connectionId, providerFileId: file.providerFileId, ...fields },
            update: fields
          });
        })
      );
    }
  }

  /**
   * Drive compartilhado renomeado ou recém-acessível. A Changes API não reemite os arquivos de um
   * drive em que o usuário acabou de entrar, então um drive novo no índice é varrido por inteiro.
   */
  private async applySharedDriveChange(connection: IndexableConnection, sharedDrive: DriveSharedDrive): Promise<void> {
    const alreadyIndexed = await this.prisma.driveIndexEntry.findUnique({
      where: {
        providerIntegrationId_providerFileId: { providerIntegrationId: connection.id, providerFileId: sharedDrive.driveId }
      },
      select: { id: true }
    });

    await this.upsertSharedDrive(connection.id, sharedDrive);
    if (!alreadyIndexed) {
      await this.scanFiles(connection, sharedDrive.driveId);
    }
  }

  /** O drive compartilhado é guardado como uma pasta de topo (ID do item = ID do drive). */
  private async upsertSharedDrive(connectionId: string, sharedDrive: DriveSharedDrive): Promise<void> {
    const fields = {
      parentFileId: null,
      driveId: sharedDrive.driveId,
      isSharedDrive: true,
      name: sharedDrive.name,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      isFolder: true,
      sizeBytes: null,
      md5Checksum: null,
      modifiedTime: null,
      webViewLink: `https://drive.google.com/drive/folders/${sharedDrive.driveId}`,
      ownedByMe: null,
      indexedAt: new Date()
    };

    await this.prisma.driveIndexEntry.upsert({
      where: {
        providerIntegrationId_providerFileId: { providerIntegrationId: connectionId, providerFileId: sharedDrive.driveId }
      },
      create: { providerIntegrationId: connectionId, providerFileId: sharedDrive.driveId, ...fields },
      update: fields
    });
  }

  /** Drive excluído ou acesso perdido: remove o drive e tudo que pertence a ele. */
  private async removeSharedDrive(connectionId: string, driveId: string): Promise<void> {
    await this.prisma.driveIndexEntry.deleteMany({
      where: { providerIntegrationId: connectionId, OR: [{ driveId }, { providerFileId: driveId }] }
    });
  }

  /** Remove os itens e, no caso de pastas, todos os descendentes ainda presentes no índice. */
  private async removeEntries(connectionId: string, providerFileIds: string[]): Promise<void> {
    let pending = [...new Set(providerFileIds)];
    const visited = new Set<string>();

    while (pending.length > 0) {
      pending.forEach((id) => visited.add(id));

      const children = await this.prisma.driveIndexEntry.findMany({
        where: { providerIntegrationId: connectionId, parentFileId: { in: pending } },
        select: { providerFileId: true }
      });

      await this.prisma.driveIndexEntry.deleteMany({
        where: { providerIntegrationId: connectionId, providerFileId: { in: pending } }
      });

      pending = children.map((child) => child.providerFileId).filter((id) => !visited.has(id));
    }
  }

  private async acquireIndexingLock(connectionId: string): Promise<boolean> {
    const staleCutoff = new Date(Date.now() - STALE_INDEXING_LOCK_MS);
    const result = await this.prisma.providerIntegration.updateMany({
      where: {
        id: connectionId,
        OR: [
          { driveIndexStatus: { not: DriveIndexStatus.INDEXING } },
          { driveIndexStartedAt: null },
          { driveIndexStartedAt: { lt: staleCutoff } }
        ]
      },
      data: {
        driveIndexStatus: DriveIndexStatus.INDEXING,
        driveIndexStartedAt: new Date(),
        driveIndexLastError: null
      }
    });

    return result.count > 0;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'unknown_error';
  }

  private maskId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  }
}
