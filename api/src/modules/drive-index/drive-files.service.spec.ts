import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { Provider, ProviderIntegrationStatus } from '@prisma/client';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { buildAttachmentDisposition } from '../../common/http/content-disposition';
import { DriveFilesService } from './drive-files.service';
import { DriveFolderZipService } from './drive-folder-zip.service';

describe(DriveFilesService.name, () => {
  const userId = '1b56a466-526f-43c8-a662-919994e0c876';
  const connectionId = '5817530b-6388-4e7c-910d-387c8a5f9eda';
  const indexedAt = new Date('2026-11-24T12:00:00.000Z');
  const connection = {
    id: connectionId,
    provider: Provider.GOOGLE_DRIVE,
    status: ProviderIntegrationStatus.CONNECTED,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    encryptedAccessToken: 'enc',
    encryptedRefreshToken: null,
    tokenExpiresAt: null,
    driveIndexRootFolderId: 'root-id'
  };

  function entry(overrides: Record<string, unknown> = {}) {
    return {
      id: 'row-id',
      providerIntegrationId: connectionId,
      providerFileId: 'file-1',
      parentFileId: 'root-id',
      driveId: null,
      isSharedDrive: false,
      name: 'relatorio.pdf',
      mimeType: 'application/pdf',
      isFolder: false,
      sizeBytes: 2048n,
      md5Checksum: 'abc',
      modifiedTime: new Date('2026-11-01T00:00:00.000Z'),
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
      indexedAt,
      ...overrides
    };
  }

  let providerIntegration: { findFirst: jest.Mock };
  let driveIndexEntry: { findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock };
  let driveProvider: jest.Mocked<Pick<GoogleDriveStorageProvider, 'downloadDriveFile'>>;
  let folderZipService: jest.Mocked<Pick<DriveFolderZipService, 'buildPlan' | 'sanitizeName'>>;
  let service: DriveFilesService;

  beforeEach(() => {
    providerIntegration = { findFirst: jest.fn().mockResolvedValue(connection) };
    driveIndexEntry = {
      findMany: jest.fn().mockResolvedValue([entry()]),
      count: jest.fn().mockResolvedValue(1),
      findUnique: jest.fn()
    };
    driveProvider = { downloadDriveFile: jest.fn() };

    const prisma = {
      providerIntegration,
      driveIndexEntry,
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
    } as unknown as PrismaService;

    folderZipService = {
      buildPlan: jest.fn().mockResolvedValue({ entries: [], skipped: [], fileCount: 0, totalBytes: 0 }),
      sanitizeName: jest.fn((name: string) => name.replace(/\//g, '_'))
    };
    service = new DriveFilesService(
      prisma,
      driveProvider as unknown as GoogleDriveStorageProvider,
      folderZipService as unknown as DriveFolderZipService
    );
  });

  it('rejects connections that belong to someone else', async () => {
    providerIntegration.findFirst.mockResolvedValue(null);
    await expect(service.listFiles(userId, connectionId, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(providerIntegration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: connectionId, userId } })
    );
  });

  it('lists the Drive root by default, folders first', async () => {
    const result = await service.listFiles(userId, connectionId, {});

    expect(driveIndexEntry.findMany).toHaveBeenCalledWith({
      where: { providerIntegrationId: connectionId, parentFileId: 'root-id' },
      orderBy: [{ isFolder: 'desc' }, { name: 'asc' }],
      skip: 0,
      take: 50
    });
    expect(result).toEqual({
      items: [
        {
          id: 'file-1',
          parentId: 'root-id',
          driveId: null,
          isSharedDrive: false,
          name: 'relatorio.pdf',
          mimeType: 'application/pdf',
          isFolder: false,
          sizeBytes: 2048,
          md5Checksum: 'abc',
          modifiedTime: '2026-11-01T00:00:00.000Z',
          webViewLink: 'https://drive.google.com/file/d/file-1/view',
          downloadable: true,
          exportExtension: null,
          indexedAt: indexedAt.toISOString()
        }
      ],
      total: 1,
      page: 1,
      pageSize: 50,
      parentId: 'root',
      section: 'my-drive',
      breadcrumb: []
    });
  });

  it('returns an empty root listing before the first indexing', async () => {
    providerIntegration.findFirst.mockResolvedValue({ ...connection, driveIndexRootFolderId: null });

    const result = await service.listFiles(userId, connectionId, {});

    expect(result.items).toEqual([]);
    expect(driveIndexEntry.findMany).not.toHaveBeenCalled();
  });

  it('lists shared items (without parent), shared drives, and searches by name across the index', async () => {
    const shared = await service.listFiles(userId, connectionId, { parentId: 'shared' });
    expect(driveIndexEntry.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { providerIntegrationId: connectionId, parentFileId: null, isSharedDrive: false } })
    );
    expect(shared.section).toBe('shared-with-me');

    const drives = await service.listFiles(userId, connectionId, { parentId: 'shared-drives' });
    expect(driveIndexEntry.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { providerIntegrationId: connectionId, isSharedDrive: true } })
    );
    expect(drives.section).toBe('shared-drives');

    const search = await service.listFiles(userId, connectionId, { q: 'relat', parentId: 'ignored', page: 2, pageSize: 10 });
    expect(driveIndexEntry.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { providerIntegrationId: connectionId, name: { contains: 'relat', mode: 'insensitive' } },
        skip: 10,
        take: 10
      })
    );
    expect(search.parentId).toBeNull();
    expect(search.section).toBe('search');
  });

  it('builds the breadcrumb of a nested folder up to the root', async () => {
    driveIndexEntry.findUnique
      .mockResolvedValueOnce({ providerFileId: 'sub', name: 'Sub', parentFileId: 'top', isSharedDrive: false })
      .mockResolvedValueOnce({ providerFileId: 'top', name: 'Projetos', parentFileId: 'root-id', isSharedDrive: false });

    const result = await service.listFiles(userId, connectionId, { parentId: 'sub' });

    expect(result.breadcrumb).toEqual([
      { id: 'top', name: 'Projetos' },
      { id: 'sub', name: 'Sub' }
    ]);
    expect(result.section).toBe('my-drive');
  });

  it('places folders inside a shared drive under the shared-drives section', async () => {
    driveIndexEntry.findUnique
      .mockResolvedValueOnce({ providerFileId: 'pasta', name: 'Contratos', parentFileId: 'drive-equipe', isSharedDrive: false })
      .mockResolvedValueOnce({ providerFileId: 'drive-equipe', name: 'Equipe', parentFileId: null, isSharedDrive: true });

    const result = await service.listFiles(userId, connectionId, { parentId: 'pasta' });

    expect(result.section).toBe('shared-drives');
    expect(result.breadcrumb).toEqual([
      { id: 'drive-equipe', name: 'Equipe' },
      { id: 'pasta', name: 'Contratos' }
    ]);
  });

  it('places folders shared directly with the user under shared-with-me', async () => {
    driveIndexEntry.findUnique.mockResolvedValueOnce({
      providerFileId: 'pasta-externa',
      name: 'Do cliente',
      parentFileId: null,
      isSharedDrive: false
    });

    const result = await service.listFiles(userId, connectionId, { parentId: 'pasta-externa' });

    expect(result.section).toBe('shared-with-me');
    expect(result.breadcrumb).toEqual([{ id: 'pasta-externa', name: 'Do cliente' }]);
  });

  it('flags Google Docs as exportable and Forms as not downloadable', async () => {
    driveIndexEntry.findUnique.mockResolvedValueOnce(
      entry({ mimeType: 'application/vnd.google-apps.document', sizeBytes: null })
    );
    const doc = await service.getFile(userId, connectionId, 'file-1');
    expect(doc).toEqual(expect.objectContaining({ downloadable: true, exportExtension: 'docx', sizeBytes: null }));

    driveIndexEntry.findUnique.mockResolvedValueOnce(entry({ mimeType: 'application/vnd.google-apps.form' }));
    const form = await service.getFile(userId, connectionId, 'file-1');
    expect(form.downloadable).toBe(false);
  });

  it('returns 404 for files outside the index', async () => {
    driveIndexEntry.findUnique.mockResolvedValue(null);
    await expect(service.getFile(userId, connectionId, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('downloadFile', () => {
    it('downloads an indexed file through the provider', async () => {
      const content = { stream: Readable.from(['x']), contentType: 'application/pdf', fileName: 'relatorio.pdf', sizeBytes: 2048 };
      driveIndexEntry.findUnique.mockResolvedValue(entry());
      driveProvider.downloadDriveFile.mockResolvedValue(content);

      await expect(service.downloadFile(userId, connectionId, 'file-1')).resolves.toBe(content);
      expect(driveProvider.downloadDriveFile).toHaveBeenCalledWith(connection, {
        providerFileId: 'file-1',
        name: 'relatorio.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048
      });
    });

    it('refuses folders and non-exportable Google types', async () => {
      driveIndexEntry.findUnique.mockResolvedValueOnce(entry({ isFolder: true, mimeType: 'application/vnd.google-apps.folder' }));
      await expect(service.downloadFile(userId, connectionId, 'file-1')).rejects.toBeInstanceOf(UnprocessableEntityException);

      driveIndexEntry.findUnique.mockResolvedValueOnce(entry({ mimeType: 'application/vnd.google-apps.form' }));
      await expect(service.downloadFile(userId, connectionId, 'file-1')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('refuses revoked connections or connections without read scope', async () => {
      providerIntegration.findFirst.mockResolvedValueOnce({ ...connection, status: ProviderIntegrationStatus.REVOKED });
      await expect(service.downloadFile(userId, connectionId, 'file-1')).rejects.toBeInstanceOf(ConflictException);

      providerIntegration.findFirst.mockResolvedValueOnce({ ...connection, scopes: ['https://www.googleapis.com/auth/drive.file'] });
      await expect(service.downloadFile(userId, connectionId, 'file-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('prepareFolderZip', () => {
    it('plans the zip of an indexed folder named after it', async () => {
      const folder = entry({ providerFileId: 'pasta', name: 'Fotos/2026', isFolder: true, mimeType: 'application/vnd.google-apps.folder' });
      driveIndexEntry.findUnique.mockResolvedValue(folder);

      const zip = await service.prepareFolderZip(userId, connectionId, 'pasta');

      expect(folderZipService.buildPlan).toHaveBeenCalledWith(connectionId, [folder]);
      expect(zip.zipName).toBe('Fotos_2026.zip');
      expect(zip.credentials).toBe(connection);
    });

    it('refuses files and connections without read access', async () => {
      driveIndexEntry.findUnique.mockResolvedValueOnce(entry());
      await expect(service.prepareFolderZip(userId, connectionId, 'file-1')).rejects.toBeInstanceOf(UnprocessableEntityException);

      providerIntegration.findFirst.mockResolvedValueOnce({ ...connection, scopes: [] });
      await expect(service.prepareFolderZip(userId, connectionId, 'pasta')).rejects.toBeInstanceOf(ForbiddenException);
      expect(folderZipService.buildPlan).not.toHaveBeenCalled();
    });
  });

  it('builds a Content-Disposition header safe for accented names', () => {
    expect(buildAttachmentDisposition('Relatório "final".pdf')).toBe(
      `attachment; filename="Relat_rio _final_.pdf"; filename*=UTF-8''Relat%C3%B3rio%20%22final%22.pdf`
    );
  });
});
