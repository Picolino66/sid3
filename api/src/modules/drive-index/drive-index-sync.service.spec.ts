import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DriveIndexStatus, Provider, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriveIndexedFile } from '../storage-providers/dto/storage-provider.types';
import {
  DriveChangesTokenExpiredError,
  GoogleDriveStorageProvider
} from '../storage-providers/google-drive-storage.provider';
import { DriveIndexSyncService } from './drive-index-sync.service';

const READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

function file(id: string, overrides: Partial<DriveIndexedFile> = {}): DriveIndexedFile {
  return {
    providerFileId: id,
    parentFileId: 'root-id',
    driveId: null,
    name: `${id}.txt`,
    mimeType: 'text/plain',
    sizeBytes: 1n,
    md5Checksum: null,
    modifiedTime: null,
    webViewLink: null,
    ownedByMe: true,
    ...overrides
  };
}

describe(DriveIndexSyncService.name, () => {
  const userId = '1b56a466-526f-43c8-a662-919994e0c876';
  const connectionId = '5817530b-6388-4e7c-910d-387c8a5f9eda';
  const credentials = {
    id: connectionId,
    provider: Provider.GOOGLE_DRIVE,
    encryptedAccessToken: 'enc-access',
    encryptedRefreshToken: 'enc-refresh',
    tokenExpiresAt: null
  };

  let providerIntegration: {
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  let driveIndexEntry: {
    upsert: jest.Mock;
    deleteMany: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
  };
  let driveProvider: jest.Mocked<
    Pick<
      GoogleDriveStorageProvider,
      | 'getChangesStartPageToken'
      | 'getRootFolderId'
      | 'listFilesPage'
      | 'listChangesPage'
      | 'listSharedDrivesPage'
      | 'listFolderChildrenPage'
    >
  >;
  let service: DriveIndexSyncService;

  beforeEach(() => {
    providerIntegration = {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 })
    };
    driveIndexEntry = {
      upsert: jest.fn((args: unknown) => args),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(3)
    };
    driveProvider = {
      getChangesStartPageToken: jest.fn().mockResolvedValue('start-token'),
      getRootFolderId: jest.fn().mockResolvedValue('root-id'),
      listFilesPage: jest.fn(),
      listChangesPage: jest.fn(),
      listSharedDrivesPage: jest.fn().mockResolvedValue({ drives: [], nextPageToken: null }),
      listFolderChildrenPage: jest.fn().mockResolvedValue({ files: [], nextPageToken: null })
    };

    const prisma = {
      providerIntegration,
      driveIndexEntry,
      $transaction: jest.fn(async (operations: unknown[]) => operations)
    } as unknown as PrismaService;

    service = new DriveIndexSyncService(prisma, driveProvider as unknown as GoogleDriveStorageProvider);
  });

  describe('requestRefresh', () => {
    it('rejects unknown connections', async () => {
      providerIntegration.findFirst.mockResolvedValue(null);
      await expect(service.requestRefresh(userId, connectionId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects revoked connections', async () => {
      providerIntegration.findFirst.mockResolvedValue({
        id: connectionId,
        status: ProviderIntegrationStatus.REVOKED,
        scopes: [READ_SCOPE]
      });
      await expect(service.requestRefresh(userId, connectionId)).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects connections without the read scope', async () => {
      providerIntegration.findFirst.mockResolvedValue({
        id: connectionId,
        status: ProviderIntegrationStatus.CONNECTED,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });
      await expect(service.requestRefresh(userId, connectionId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not start a second run while one is in progress', async () => {
      providerIntegration.findFirst
        .mockResolvedValueOnce({ id: connectionId, status: ProviderIntegrationStatus.CONNECTED, scopes: [READ_SCOPE] })
        .mockResolvedValueOnce({
          id: connectionId,
          scopes: [READ_SCOPE],
          driveIndexStatus: DriveIndexStatus.INDEXING,
          driveIndexStartedAt: new Date('2026-11-24T10:00:00.000Z'),
          driveIndexedAt: null,
          driveIndexItemCount: 0,
          driveIndexLastError: null
        });
      providerIntegration.updateMany.mockResolvedValue({ count: 0 });
      const runSpy = jest.spyOn(service, 'runIndexing');

      const status = await service.requestRefresh(userId, connectionId);

      expect(runSpy).not.toHaveBeenCalled();
      expect(status).toEqual({
        connectionId,
        status: DriveIndexStatus.INDEXING,
        hasReadScope: true,
        startedAt: '2026-11-24T10:00:00.000Z',
        lastIndexedAt: null,
        itemCount: 0,
        lastError: null
      });
    });

    it('acquires the lock and runs the indexing in background', async () => {
      providerIntegration.findFirst
        .mockResolvedValueOnce({ id: connectionId, status: ProviderIntegrationStatus.CONNECTED, scopes: [READ_SCOPE] })
        .mockResolvedValueOnce({
          id: connectionId,
          scopes: [READ_SCOPE],
          driveIndexStatus: DriveIndexStatus.INDEXING,
          driveIndexStartedAt: new Date(),
          driveIndexedAt: null,
          driveIndexItemCount: 0,
          driveIndexLastError: null
        });
      const runSpy = jest.spyOn(service, 'runIndexing').mockResolvedValue();

      await service.requestRefresh(userId, connectionId, 'full');

      expect(providerIntegration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveIndexStatus: DriveIndexStatus.INDEXING }) })
      );
      expect(runSpy).toHaveBeenCalledWith(connectionId, 'full');
    });
  });

  describe('runIndexing', () => {
    it('runs a full scan when there is no changes token yet', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: null,
        driveIndexRootFolderId: null
      });
      driveProvider.listFilesPage
        .mockResolvedValueOnce({ files: [file('a'), file('pasta', { mimeType: 'application/vnd.google-apps.folder' })], nextPageToken: 'p2' })
        .mockResolvedValueOnce({ files: [file('b')], nextPageToken: null });

      await service.runIndexing(connectionId, 'incremental');

      expect(driveProvider.getChangesStartPageToken).toHaveBeenCalled();
      expect(driveProvider.listFilesPage).toHaveBeenNthCalledWith(2, expect.anything(), 'p2', undefined);
      expect(driveIndexEntry.upsert).toHaveBeenCalledTimes(3);
      expect(driveIndexEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ providerFileId: 'pasta', isFolder: true }) })
      );
      expect(driveIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { providerIntegrationId: connectionId, indexedAt: { lt: expect.any(Date) } }
      });
      expect(providerIntegration.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: { driveIndexChangesToken: 'start-token', driveIndexRootFolderId: 'root-id' }
      });
      expect(providerIntegration.update).toHaveBeenLastCalledWith({
        where: { id: connectionId },
        data: expect.objectContaining({ driveIndexStatus: DriveIndexStatus.READY, driveIndexItemCount: 3 })
      });
    });

    it('applies only changes when a token exists, removing folders with their descendants', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: 'token-1',
        driveIndexRootFolderId: 'root-id'
      });
      driveProvider.listChangesPage
        .mockResolvedValueOnce({
          changes: [{ kind: 'file', providerFileId: 'novo', removed: false, file: file('novo') }],
          nextPageToken: 'token-2',
          newStartPageToken: null
        })
        .mockResolvedValueOnce({
          changes: [{ kind: 'file', providerFileId: 'pasta-apagada', removed: true, file: null }],
          nextPageToken: null,
          newStartPageToken: 'token-3'
        });
      driveIndexEntry.findMany
        .mockResolvedValueOnce([{ providerFileId: 'filho' }])
        .mockResolvedValueOnce([]);

      await service.runIndexing(connectionId, 'incremental');

      expect(driveProvider.listFilesPage).not.toHaveBeenCalled();
      expect(driveIndexEntry.upsert).toHaveBeenCalledTimes(1);
      expect(driveIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { providerIntegrationId: connectionId, providerFileId: { in: ['pasta-apagada'] } }
      });
      expect(driveIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { providerIntegrationId: connectionId, providerFileId: { in: ['filho'] } }
      });
      expect(providerIntegration.update).toHaveBeenCalledWith({
        where: { id: connectionId },
        data: { driveIndexChangesToken: 'token-3', driveIndexRootFolderId: 'root-id' }
      });
    });

    it('scans every shared drive during a full scan, storing the drive as a top-level folder', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: null,
        driveIndexRootFolderId: null
      });
      driveProvider.listSharedDrivesPage.mockResolvedValue({
        drives: [{ driveId: 'drive-equipe', name: 'Equipe' }],
        nextPageToken: null
      });
      driveProvider.listFilesPage
        .mockResolvedValueOnce({ files: [file('meu')], nextPageToken: null })
        .mockResolvedValueOnce({
          files: [file('do-time', { parentFileId: 'drive-equipe', driveId: 'drive-equipe' })],
          nextPageToken: null
        });

      await service.runIndexing(connectionId, 'full');

      expect(driveProvider.listFilesPage).toHaveBeenNthCalledWith(1, expect.anything(), null, undefined);
      expect(driveProvider.listFilesPage).toHaveBeenNthCalledWith(2, expect.anything(), null, 'drive-equipe');
      expect(driveIndexEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            providerFileId: 'drive-equipe',
            name: 'Equipe',
            isSharedDrive: true,
            isFolder: true,
            parentFileId: null,
            driveId: 'drive-equipe'
          })
        })
      );
      expect(driveIndexEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ providerFileId: 'do-time', driveId: 'drive-equipe', isSharedDrive: false })
        })
      );
    });

    it('handles shared drive changes: scans newly joined drives, renames known ones, drops removed ones', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: 'token-1',
        driveIndexRootFolderId: 'root-id'
      });
      driveProvider.listChangesPage.mockResolvedValue({
        changes: [
          { kind: 'drive', driveId: 'novo-drive', removed: false, drive: { driveId: 'novo-drive', name: 'Novo' } },
          { kind: 'drive', driveId: 'drive-conhecido', removed: false, drive: { driveId: 'drive-conhecido', name: 'Renomeado' } },
          { kind: 'drive', driveId: 'drive-saiu', removed: true, drive: null }
        ],
        nextPageToken: null,
        newStartPageToken: 'token-2'
      });
      driveIndexEntry.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'row' });
      driveProvider.listFilesPage.mockResolvedValue({ files: [], nextPageToken: null });

      await service.runIndexing(connectionId, 'incremental');

      expect(driveProvider.listFilesPage).toHaveBeenCalledTimes(1);
      expect(driveProvider.listFilesPage).toHaveBeenCalledWith(expect.anything(), null, 'novo-drive');
      expect(driveIndexEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ name: 'Renomeado', isSharedDrive: true }) })
      );
      expect(driveIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { providerIntegrationId: connectionId, OR: [{ driveId: 'drive-saiu' }, { providerFileId: 'drive-saiu' }] }
      });
    });

    it('crawls folders shared with me by parent, since the user corpus omits their contents', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: null,
        driveIndexRootFolderId: null
      });
      const folder = 'application/vnd.google-apps.folder';
      driveProvider.listFilesPage.mockResolvedValueOnce({
        files: [file('pasta-da-ana', { mimeType: folder, parentFileId: null, ownedByMe: false })],
        nextPageToken: null
      });
      driveIndexEntry.findMany.mockImplementation(({ where }) => {
        if (where.isSharedDrive === true) {
          return Promise.resolve([{ providerFileId: 'drive-que-sou-membro' }]);
        }
        if (where.OR) {
          return Promise.resolve([{ providerFileId: 'pasta-da-ana' }]);
        }
        // Antes da releitura, o índice tinha um arquivo na pasta que a Ana já removeu.
        if (where.parentFileId?.in?.includes('pasta-da-ana')) {
          return Promise.resolve([{ providerFileId: 'aula-1' }, { providerFileId: 'removido' }]);
        }
        return Promise.resolve([]);
      });
      driveProvider.listFolderChildrenPage
        .mockResolvedValueOnce({
          files: [
            file('aula-1', { parentFileId: 'pasta-da-ana', ownedByMe: false }),
            file('modulo-2', { parentFileId: 'pasta-da-ana', mimeType: folder, ownedByMe: false })
          ],
          nextPageToken: 'p2'
        })
        .mockResolvedValueOnce({ files: [file('aula-2', { parentFileId: 'pasta-da-ana', ownedByMe: false })], nextPageToken: null })
        .mockResolvedValueOnce({ files: [file('aula-3', { parentFileId: 'modulo-2', ownedByMe: false })], nextPageToken: null });

      await service.runIndexing(connectionId, 'full');

      // Pastas de outras pessoas e pastas de drives compartilhados dos quais a conta não é membro.
      expect(driveIndexEntry.findMany).toHaveBeenCalledWith({
        where: {
          providerIntegrationId: connectionId,
          isFolder: true,
          isSharedDrive: false,
          OR: [
            { driveId: null, ownedByMe: false },
            { driveId: { not: null, notIn: ['drive-que-sou-membro'] } }
          ]
        },
        select: { providerFileId: true }
      });
      expect(driveProvider.listFolderChildrenPage).toHaveBeenNthCalledWith(1, expect.anything(), 'pasta-da-ana', null);
      expect(driveProvider.listFolderChildrenPage).toHaveBeenNthCalledWith(2, expect.anything(), 'pasta-da-ana', 'p2');
      expect(driveProvider.listFolderChildrenPage).toHaveBeenNthCalledWith(3, expect.anything(), 'modulo-2', null);
      for (const id of ['aula-1', 'aula-2', 'modulo-2', 'aula-3']) {
        expect(driveIndexEntry.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ create: expect.objectContaining({ providerFileId: id, ownedByMe: false }) })
        );
      }
      expect(driveIndexEntry.deleteMany).toHaveBeenCalledWith({
        where: { providerIntegrationId: connectionId, providerFileId: { in: ['removido'] } }
      });
      expect(providerIntegration.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveIndexStatus: DriveIndexStatus.READY }) })
      );
    });

    it('re-crawls folders shared with me on an incremental refresh', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: 'token-1',
        driveIndexRootFolderId: 'root-id'
      });
      driveProvider.listChangesPage.mockResolvedValue({ changes: [], nextPageToken: null, newStartPageToken: 'token-2' });
      driveIndexEntry.findMany.mockImplementation(({ where }) =>
        Promise.resolve(where.OR ? [{ providerFileId: 'pasta-da-ana' }] : [])
      );
      driveProvider.listFolderChildrenPage.mockResolvedValueOnce({
        files: [file('novo-na-pasta', { parentFileId: 'pasta-da-ana', ownedByMe: false })],
        nextPageToken: null
      });

      await service.runIndexing(connectionId, 'incremental');

      expect(driveProvider.listFilesPage).not.toHaveBeenCalled();
      expect(driveProvider.listFolderChildrenPage).toHaveBeenCalledWith(expect.anything(), 'pasta-da-ana', null);
      expect(driveIndexEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ create: expect.objectContaining({ providerFileId: 'novo-na-pasta' }) })
      );
    });

    it('falls back to a full scan when the changes token expired', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: 'expired',
        driveIndexRootFolderId: 'root-id'
      });
      driveProvider.listChangesPage.mockRejectedValue(new DriveChangesTokenExpiredError());
      driveProvider.listFilesPage.mockResolvedValue({ files: [], nextPageToken: null });

      await service.runIndexing(connectionId, 'incremental');

      expect(driveProvider.listFilesPage).toHaveBeenCalledTimes(1);
      expect(providerIntegration.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ driveIndexStatus: DriveIndexStatus.READY }) })
      );
    });

    it('records the failure instead of throwing', async () => {
      providerIntegration.findUniqueOrThrow.mockResolvedValue({
        ...credentials,
        driveIndexChangesToken: null,
        driveIndexRootFolderId: null
      });
      driveProvider.getChangesStartPageToken.mockRejectedValue(new Error('Google Drive changes token fetch failed: 401'));

      await expect(service.runIndexing(connectionId, 'full')).resolves.toBeUndefined();

      expect(providerIntegration.update).toHaveBeenLastCalledWith({
        where: { id: connectionId },
        data: {
          driveIndexStatus: DriveIndexStatus.FAILED,
          driveIndexStartedAt: null,
          driveIndexLastError: 'Google Drive changes token fetch failed: 401'
        }
      });
    });
  });

  it('marks runs interrupted by a restart as failed on bootstrap', async () => {
    providerIntegration.updateMany.mockResolvedValue({ count: 2 });

    await service.onApplicationBootstrap();

    expect(providerIntegration.updateMany).toHaveBeenCalledWith({
      where: { driveIndexStatus: DriveIndexStatus.INDEXING },
      data: expect.objectContaining({ driveIndexStatus: DriveIndexStatus.FAILED })
    });
  });
});
