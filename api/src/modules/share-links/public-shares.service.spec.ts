import {
  BadGatewayException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
import { Provider, ProviderIntegrationStatus } from '@prisma/client';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { DriveFolderZipService } from '../drive-index/drive-folder-zip.service';
import { PublicSharesService } from './public-shares.service';
import { generateShareLinkToken, hashShareLinkToken } from './share-link-token';

const FOLDER = 'application/vnd.google-apps.folder';

describe(PublicSharesService.name, () => {
  const token = generateShareLinkToken();
  const connectionId = '5817530b-6388-4e7c-910d-387c8a5f9eda';
  const connection = {
    id: connectionId,
    provider: Provider.GOOGLE_DRIVE,
    status: ProviderIntegrationStatus.CONNECTED,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    encryptedAccessToken: 'enc',
    encryptedRefreshToken: null,
    tokenExpiresAt: null
  };

  /**
   * Índice de teste:
   *   root ─┬─ compartilhada (pasta, item do link) ─── sub (pasta) ─── foto.png
   *         └─ privada (pasta, fora do link) ─── segredo.pdf
   */
  const index: Record<string, Record<string, unknown>> = {
    compartilhada: { parentFileId: 'root', name: 'Compartilhada', mimeType: FOLDER, isFolder: true },
    sub: { parentFileId: 'compartilhada', name: 'Sub', mimeType: FOLDER, isFolder: true },
    'foto.png': { parentFileId: 'sub', name: 'foto.png', mimeType: 'image/png', isFolder: false, sizeBytes: 10n },
    'aula.mp4': { parentFileId: 'sub', name: 'aula.mp4', mimeType: 'video/mp4', isFolder: false, sizeBytes: 1000n },
    'pagina.html': { parentFileId: 'sub', name: 'pagina.html', mimeType: 'text/html', isFolder: false, sizeBytes: 5n },
    privada: { parentFileId: 'root', name: 'Privada', mimeType: FOLDER, isFolder: true },
    'segredo.pdf': { parentFileId: 'privada', name: 'segredo.pdf', mimeType: 'application/pdf', isFolder: false },
    'form-compartilhado': {
      parentFileId: 'root',
      name: 'Pesquisa',
      mimeType: 'application/vnd.google-apps.form',
      isFolder: false
    }
  };

  function entry(id: string) {
    const data = index[id];
    return data
      ? {
          id: `row-${id}`,
          providerIntegrationId: connectionId,
          providerFileId: id,
          driveId: null,
          isSharedDrive: false,
          sizeBytes: null,
          md5Checksum: null,
          modifiedTime: null,
          webViewLink: 'https://drive.google.com/secret',
          indexedAt: new Date(),
          ...data
        }
      : null;
  }

  let shareLink: { findUnique: jest.Mock; update: jest.Mock };
  let driveIndexEntry: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  let driveProvider: jest.Mocked<Pick<GoogleDriveStorageProvider, 'downloadDriveFile' | 'getVideoDurationMs'>>;
  let folderZipService: jest.Mocked<Pick<DriveFolderZipService, 'buildPlan' | 'sanitizeName'>>;
  let service: PublicSharesService;
  let queryRaw: jest.Mock;

  function linkRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'link-id-1234567890',
      name: 'Fotos',
      createdAt: new Date('2026-11-24T12:00:00.000Z'),
      expiresAt: null,
      revokedAt: null,
      owner: { name: 'Ana' },
      items: [{ providerFileId: 'compartilhada' }, { providerFileId: 'form-compartilhado' }],
      providerIntegration: connection,
      ...overrides
    };
  }

  beforeEach(() => {
    shareLink = { findUnique: jest.fn().mockResolvedValue(linkRecord()), update: jest.fn().mockResolvedValue({}) };
    driveIndexEntry = {
      findUnique: jest.fn(({ where }) => Promise.resolve(entry(where.providerIntegrationId_providerFileId.providerFileId))),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    };
    driveProvider = { downloadDriveFile: jest.fn(), getVideoDurationMs: jest.fn() };

    queryRaw = jest.fn();
    const prisma = {
      shareLink,
      driveIndexEntry,
      $queryRaw: queryRaw,
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations))
    } as unknown as PrismaService;

    folderZipService = {
      buildPlan: jest.fn().mockResolvedValue({ entries: [], skipped: [], fileCount: 0, totalBytes: 0 }),
      sanitizeName: jest.fn((name: string) => name)
    };
    service = new PublicSharesService(
      prisma,
      driveProvider as unknown as GoogleDriveStorageProvider,
      folderZipService as unknown as DriveFolderZipService
    );
  });

  describe('resolving the link', () => {
    it('looks the link up by token hash and rejects malformed tokens without hitting the database', async () => {
      await service.getShare(token);
      expect(shareLink.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashShareLinkToken(token) } })
      );

      shareLink.findUnique.mockClear();
      await expect(service.getShare('curto')).rejects.toBeInstanceOf(NotFoundException);
      expect(shareLink.findUnique).not.toHaveBeenCalled();
    });

    it('returns 404 for unknown, 410 for revoked/expired and 503 when the owner connection is unusable', async () => {
      shareLink.findUnique.mockResolvedValueOnce(null);
      await expect(service.getShare(token)).rejects.toBeInstanceOf(NotFoundException);

      shareLink.findUnique.mockResolvedValueOnce(linkRecord({ revokedAt: new Date() }));
      await expect(service.getShare(token)).rejects.toBeInstanceOf(GoneException);

      shareLink.findUnique.mockResolvedValueOnce(linkRecord({ expiresAt: new Date(Date.now() - 1) }));
      await expect(service.getShare(token)).rejects.toBeInstanceOf(GoneException);

      shareLink.findUnique.mockResolvedValueOnce(
        linkRecord({ providerIntegration: { ...connection, status: ProviderIntegrationStatus.REVOKED } })
      );
      await expect(service.getShare(token)).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  it('shows the shared items without internal fields and counts the access', async () => {
    driveIndexEntry.findMany.mockResolvedValue([entry('compartilhada')]);

    const share = await service.getShare(token);

    expect(share).toEqual({
      name: 'Fotos',
      sharedBy: 'Ana',
      createdAt: '2026-11-24T12:00:00.000Z',
      expiresAt: null,
      items: [
        {
          id: 'compartilhada',
          name: 'Compartilhada',
          mimeType: FOLDER,
          isFolder: true,
          isSharedDrive: false,
          sizeBytes: null,
          modifiedTime: null,
          downloadable: false,
          exportExtension: null,
          previewKind: null
        }
      ]
    });
    expect(JSON.stringify(share)).not.toContain('drive.google.com');
    expect(shareLink.update).toHaveBeenCalledWith({
      where: { id: 'link-id-1234567890' },
      data: { accessCount: { increment: 1 }, lastAccessedAt: expect.any(Date) }
    });
  });

  it('lists a nested folder inside a shared folder with the path from the shared item', async () => {
    driveIndexEntry.findMany.mockResolvedValue([entry('foto.png')]);
    driveIndexEntry.count.mockResolvedValue(1);

    const listing = await service.listFolder(token, 'sub');

    expect(listing.breadcrumb).toEqual([
      { id: 'compartilhada', name: 'Compartilhada' },
      { id: 'sub', name: 'Sub' }
    ]);
    expect(driveIndexEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { providerIntegrationId: connectionId, parentFileId: 'sub' }, skip: 0, take: 100 })
    );
    expect(listing.items[0]).toEqual(expect.objectContaining({ id: 'foto.png', downloadable: true, previewKind: 'image' }));
  });

  it('never exposes folders or files outside the shared items', async () => {
    await expect(service.listFolder(token, 'privada')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.listFolder(token, 'root')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.downloadFile(token, 'segredo.pdf')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.downloadFile(token, 'nao-indexado')).rejects.toBeInstanceOf(NotFoundException);
    expect(driveProvider.downloadDriveFile).not.toHaveBeenCalled();
  });

  it('downloads a file nested inside a shared folder', async () => {
    const content = { stream: Readable.from(['x']), contentType: 'image/png', fileName: 'foto.png', sizeBytes: 10 };
    driveProvider.downloadDriveFile.mockResolvedValue(content);

    await expect(service.downloadFile(token, 'foto.png')).resolves.toBe(content);
    expect(driveProvider.downloadDriveFile).toHaveBeenCalledWith(connection, {
      providerFileId: 'foto.png',
      name: 'foto.png',
      mimeType: 'image/png',
      sizeBytes: 10
    });
  });

  it('hides Google error details from anonymous visitors', async () => {
    driveProvider.downloadDriveFile.mockRejectedValue(
      new BadGatewayException('Google Drive file download failed: invalid credentials for owner@example.com')
    );

    const failure = service.downloadFile(token, 'foto.png');

    await expect(failure).rejects.toBeInstanceOf(BadGatewayException);
    await expect(failure).rejects.not.toThrow(/owner@example.com|credentials/);
  });

  it('refuses to download folders and non-exportable Google types', async () => {
    await expect(service.downloadFile(token, 'compartilhada')).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(service.downloadFile(token, 'form-compartilhado')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  describe('media preview', () => {
    const video = { stream: Readable.from(['x']), contentType: 'video/mp4', fileName: 'aula.mp4', sizeBytes: 1000 };

    it('streams a video inside a shared folder, forwarding the byte range to Google', async () => {
      driveProvider.downloadDriveFile.mockResolvedValue(video);

      const result = await service.streamMedia(token, 'aula.mp4', 'bytes=500-');

      expect(result).toEqual({
        kind: 'content',
        content: video,
        partial: { contentRange: 'bytes 500-999/1000', contentLength: 500 },
        contentLength: 500
      });
      expect(driveProvider.downloadDriveFile).toHaveBeenCalledWith(
        connection,
        { providerFileId: 'aula.mp4', name: 'aula.mp4', mimeType: 'video/mp4', sizeBytes: 1000 },
        { range: 'bytes=500-' }
      );
    });

    it('serves the whole file without a range', async () => {
      driveProvider.downloadDriveFile.mockResolvedValue(video);

      await expect(service.streamMedia(token, 'aula.mp4')).resolves.toEqual({
        kind: 'content',
        content: video,
        partial: null,
        contentLength: 1000
      });
      expect(driveProvider.downloadDriveFile).toHaveBeenCalledWith(connection, expect.anything(), {});
    });

    it('shifts ranges by the start offset, reporting sizes as seen from it', async () => {
      driveProvider.downloadDriveFile.mockResolvedValue(video);

      const result = await service.streamMedia(token, 'aula.mp4', 'bytes=100-199', 600);

      expect(driveProvider.downloadDriveFile).toHaveBeenCalledWith(connection, expect.anything(), { range: 'bytes=700-799' });
      expect(result).toEqual(
        expect.objectContaining({ partial: { contentRange: 'bytes 100-199/400', contentLength: 100 }, contentLength: 100 })
      );

      await service.streamMedia(token, 'aula.mp4', undefined, 600);
      expect(driveProvider.downloadDriveFile).toHaveBeenLastCalledWith(connection, expect.anything(), { range: 'bytes=600-' });

      await expect(service.streamMedia(token, 'aula.mp4', undefined, 1000)).resolves.toEqual({
        kind: 'unsatisfiable',
        sizeBytes: 1000
      });
    });

    it('returns the video duration from Google Drive, and null when unavailable', async () => {
      driveProvider.getVideoDurationMs.mockResolvedValueOnce(1567132).mockRejectedValueOnce(new Error('boom'));

      await expect(service.getMediaInfo(token, 'aula.mp4')).resolves.toEqual({ durationMs: 1567132 });
      await expect(service.getMediaInfo(token, 'aula.mp4')).resolves.toEqual({ durationMs: null });
      await expect(service.getMediaInfo(token, 'foto.png')).resolves.toEqual({ durationMs: null });
      await expect(service.getMediaInfo(token, 'segredo.pdf')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers ranges past the end of the file without calling Google', async () => {
      await expect(service.streamMedia(token, 'aula.mp4', 'bytes=1000-')).resolves.toEqual({
        kind: 'unsatisfiable',
        sizeBytes: 1000
      });
      expect(driveProvider.downloadDriveFile).not.toHaveBeenCalled();
    });

    it('refuses items outside the link and anything that is not image, video or audio', async () => {
      await expect(service.streamMedia(token, 'segredo.pdf')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.streamMedia(token, 'pagina.html')).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(service.streamMedia(token, 'sub')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(driveProvider.downloadDriveFile).not.toHaveBeenCalled();
    });

    it('hides Google error details while streaming', async () => {
      driveProvider.downloadDriveFile.mockRejectedValue(new BadGatewayException('token of owner@example.com'));

      const failure = service.streamMedia(token, 'aula.mp4');

      await expect(failure).rejects.toBeInstanceOf(BadGatewayException);
      await expect(failure).rejects.not.toThrow(/owner@example.com/);
    });
  });

  describe('search', () => {
    it('searches only inside the shared items, ignoring accents, and returns the path of each match', async () => {
      queryRaw.mockResolvedValueOnce([{ total: 1n }]).mockResolvedValueOnce([
        {
          providerFileId: 'aula.mp4',
          name: 'aula.mp4',
          mimeType: 'video/mp4',
          isFolder: false,
          isSharedDrive: false,
          sizeBytes: 1000n,
          modifiedTime: null,
          path: ['Compartilhada', 'Sub'],
          parentInShare: 'sub'
        }
      ]);

      const result = await service.search(token, 'Aúla_1', 2);

      expect(result).toEqual({
        query: 'Aúla_1',
        total: 1,
        page: 2,
        pageSize: 50,
        items: [
          expect.objectContaining({ id: 'aula.mp4', previewKind: 'video', sizeBytes: 1000, path: ['Compartilhada', 'Sub'], parentId: 'sub' })
        ]
      });
      // $queryRaw é chamado como template: [trechos, árvore (Prisma.Sql), ...valores].
      const [, tree] = queryRaw.mock.calls[0] as [TemplateStringsArray, { values: unknown[] }];
      // Escopo: a conexão do link e os itens compartilhados; termo sem acento e com curingas escapados.
      expect(tree.values).toEqual(expect.arrayContaining([connectionId, ['compartilhada', 'form-compartilhado'], '%Aula\\_1%']));
      const [, , ...pageValues] = queryRaw.mock.calls[1] as unknown[];
      expect(pageValues).toEqual([connectionId, 50, 50]);
    });
  });

  describe('zip downloads', () => {
    it('zips a folder nested inside a shared folder', async () => {
      const zip = await service.prepareFolderZip(token, 'sub');

      expect(folderZipService.buildPlan).toHaveBeenCalledWith(connectionId, [expect.objectContaining({ providerFileId: 'sub' })]);
      expect(zip.zipName).toBe('Sub.zip');
    });

    it('never zips folders outside the link, and refuses files', async () => {
      await expect(service.prepareFolderZip(token, 'privada')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.prepareFolderZip(token, 'root')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.prepareFolderZip(token, 'form-compartilhado')).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(folderZipService.buildPlan).not.toHaveBeenCalled();
    });

    it('zips all shared items, named after the link', async () => {
      driveIndexEntry.findMany.mockResolvedValue([entry('compartilhada'), entry('form-compartilhado')]);

      const zip = await service.prepareShareZip(token);

      expect(driveIndexEntry.findMany).toHaveBeenCalledWith({
        where: { providerIntegrationId: connectionId, providerFileId: { in: ['compartilhada', 'form-compartilhado'] } }
      });
      expect(folderZipService.buildPlan).toHaveBeenCalledWith(connectionId, [
        expect.objectContaining({ providerFileId: 'compartilhada' }),
        expect.objectContaining({ providerFileId: 'form-compartilhado' })
      ]);
      expect(zip.zipName).toBe('Fotos.zip');
    });

    it('rejects zips of revoked links', async () => {
      shareLink.findUnique.mockResolvedValueOnce(linkRecord({ revokedAt: new Date() }));
      await expect(service.prepareShareZip(token)).rejects.toBeInstanceOf(GoneException);
    });
  });

  it('refuses to list a shared file as if it were a folder', async () => {
    await expect(service.listFolder(token, 'form-compartilhado')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});
