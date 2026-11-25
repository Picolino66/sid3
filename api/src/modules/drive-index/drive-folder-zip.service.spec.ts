import { BadGatewayException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DriveIndexEntry } from '@prisma/client';
import { PassThrough, Readable } from 'stream';
import { inflateRawSync } from 'zlib';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { DriveFolderZipService } from './drive-folder-zip.service';

const FOLDER = 'application/vnd.google-apps.folder';
const CONNECTION_ID = '5817530b-6388-4e7c-910d-387c8a5f9eda';

function entry(id: string, overrides: Partial<DriveIndexEntry> = {}): DriveIndexEntry {
  return {
    id: `row-${id}`,
    providerIntegrationId: CONNECTION_ID,
    providerFileId: id,
    parentFileId: null,
    driveId: null,
    isSharedDrive: false,
    name: id,
    mimeType: 'text/plain',
    isFolder: false,
    sizeBytes: 5n,
    md5Checksum: null,
    modifiedTime: null,
    webViewLink: null,
    ownedByMe: null,
    indexedAt: new Date(),
    ...overrides
  };
}

/** Lê o diretório central de um ZIP (sem ZIP64) e devolve nome → conteúdo descomprimido. */
function readZip(buffer: Buffer): Map<string, string> {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, string>();

  for (let index = 0; index < count; index += 1) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

describe(DriveFolderZipService.name, () => {
  const credentials = {
    provider: 'GOOGLE_DRIVE' as const,
    encryptedAccessToken: 'enc',
    encryptedRefreshToken: null,
    tokenExpiresAt: null
  };

  let driveIndexEntry: { findMany: jest.Mock };
  let driveProvider: jest.Mocked<Pick<GoogleDriveStorageProvider, 'downloadDriveFile'>>;

  function createService(config: Record<string, string> = {}): DriveFolderZipService {
    return new DriveFolderZipService(
      { driveIndexEntry } as unknown as PrismaService,
      driveProvider as unknown as GoogleDriveStorageProvider,
      { get: (key: string) => config[key] } as unknown as ConfigService
    );
  }

  /**
   * Fotos/
   *   Palco/ (vazia)
   *   a.txt, A.txt (colisão), Contrato (Google Doc), Pesquisa (Form), bar/ra.txt (nome com barra)
   */
  const fotos = entry('fotos', { name: 'Fotos', isFolder: true, mimeType: FOLDER, sizeBytes: null });
  const children = [
    entry('palco', { name: 'Palco', isFolder: true, mimeType: FOLDER, parentFileId: 'fotos', sizeBytes: null }),
    entry('a1', { name: 'a.txt', parentFileId: 'fotos' }),
    entry('a2', { name: 'A.txt', parentFileId: 'fotos' }),
    entry('doc', { name: 'Contrato', mimeType: 'application/vnd.google-apps.document', parentFileId: 'fotos', sizeBytes: null }),
    entry('form', { name: 'Pesquisa', mimeType: 'application/vnd.google-apps.form', parentFileId: 'fotos', sizeBytes: null }),
    entry('slash', { name: 'bar/ra.txt', parentFileId: 'fotos' })
  ];

  beforeEach(() => {
    driveIndexEntry = {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(where.parentFileId.in.includes('fotos') ? children : [])
      )
    };
    driveProvider = {
      downloadDriveFile: jest.fn((_credentials, file) =>
        Promise.resolve({
          stream: Readable.from([`conteudo de ${file.providerFileId}`]),
          contentType: 'text/plain',
          fileName: file.name,
          sizeBytes: null
        })
      )
    };
  });

  describe('buildPlan', () => {
    it('maps the folder tree to safe, unique zip paths and skips non-downloadable Google types', async () => {
      const plan = await createService().buildPlan(CONNECTION_ID, [fotos]);

      expect(plan.entries.map((item) => item.path)).toEqual([
        'Fotos/',
        'Fotos/Palco/',
        'Fotos/a.txt',
        'Fotos/A (2).txt',
        'Fotos/Contrato.docx',
        'Fotos/bar_ra.txt'
      ]);
      expect(plan.skipped).toEqual([{ path: 'Fotos/Pesquisa', reason: expect.stringContaining('form') }]);
      expect(plan.fileCount).toBe(4);
      expect(plan.totalBytes).toBe(15);
      expect(driveIndexEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { providerIntegrationId: CONNECTION_ID, parentFileId: { in: ['fotos'] } } })
      );
    });

    it('enforces the file count and size limits', async () => {
      await expect(createService({ SID3_ZIP_MAX_FILES: '3' }).buildPlan(CONNECTION_ID, [fotos])).rejects.toBeInstanceOf(
        PayloadTooLargeException
      );

      const huge = entry('huge', { sizeBytes: BigInt(2 * 1024 ** 2) });
      await expect(createService({ SID3_ZIP_MAX_MB: '1' }).buildPlan(CONNECTION_ID, [huge])).rejects.toBeInstanceOf(
        PayloadTooLargeException
      );
    });

    it('sanitizes reserved names', () => {
      const service = createService();
      expect(service.sanitizeName('..')).toBe('_');
      expect(service.sanitizeName('a:b*c?.txt. ')).toBe('a_b_c_.txt');
      expect(service.sanitizeName('   ')).toBe('_');
    });
  });

  describe('streamZip', () => {
    async function zipToBuffer(service: DriveFolderZipService, roots: DriveIndexEntry[]) {
      const plan = await service.buildPlan(CONNECTION_ID, roots);
      const destination = new PassThrough();
      const chunks: Buffer[] = [];
      const ended = new Promise((resolve) => destination.on('end', resolve));
      destination.on('data', (chunk: Buffer) => chunks.push(chunk));
      const result = await service.streamZip(credentials, plan, destination);
      await ended;
      return { result, files: readZip(Buffer.concat(chunks)) };
    }

    it('writes a valid zip with folders, files and a notice for skipped items', async () => {
      const { result, files } = await zipToBuffer(createService(), [fotos]);

      expect([...files.keys()]).toEqual([
        'Fotos/',
        'Fotos/Palco/',
        'Fotos/a.txt',
        'Fotos/A (2).txt',
        'Fotos/Contrato.docx',
        'Fotos/bar_ra.txt',
        'LEIA-ME - arquivos nao incluidos.txt'
      ]);
      expect(files.get('Fotos/a.txt')).toBe('conteudo de a1');
      expect(files.get('Fotos/Contrato.docx')).toBe('conteudo de doc');
      expect(files.get('LEIA-ME - arquivos nao incluidos.txt')).toContain('Fotos/Pesquisa');
      expect(result).toEqual({ filesWritten: 4, failures: [], aborted: false });
      // Um download por vez, na ordem do plano.
      expect(driveProvider.downloadDriveFile.mock.calls.map((call) => call[1].providerFileId)).toEqual(['a1', 'a2', 'doc', 'slash']);
    });

    it('keeps going when a file fails, without leaking the Google error into the zip', async () => {
      driveProvider.downloadDriveFile.mockImplementationOnce(() =>
        Promise.reject(new BadGatewayException('Google Drive file download failed: token of owner@example.com'))
      );

      const { result, files } = await zipToBuffer(createService(), [fotos]);

      expect(files.has('Fotos/a.txt')).toBe(false);
      expect(files.get('Fotos/A (2).txt')).toBe('conteudo de a2');
      const notice = files.get('LEIA-ME - arquivos nao incluidos.txt')!;
      expect(notice).toContain('Fotos/a.txt');
      expect(notice).not.toContain('owner@example.com');
      expect(result.failures).toEqual([{ path: 'Fotos/a.txt', reason: 'não foi possível obter o arquivo do Google Drive' }]);
    });

    it('stops downloading when the client disconnects', async () => {
      const service = createService();
      const plan = await service.buildPlan(CONNECTION_ID, [fotos]);
      const destination = new PassThrough();
      destination.resume();
      driveProvider.downloadDriveFile.mockImplementationOnce(async (_credentials, file) => {
        destination.destroy();
        return { stream: Readable.from(['x']), contentType: 'text/plain', fileName: file.name, sizeBytes: null };
      });

      const result = await service.streamZip(credentials, plan, destination);

      expect(result.aborted).toBe(true);
      expect(driveProvider.downloadDriveFile).toHaveBeenCalledTimes(1);
    });
  });
});
