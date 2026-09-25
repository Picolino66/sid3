import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import { Readable } from 'stream';
import { getDriveChunkTimeoutMs } from '../../config/upload.config';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import {
  DeleteObjectInput,
  DownloadObjectInput,
  DownloadObjectResult,
  StorageProviderIntegrationCredentials,
  StorageProviderPort,
  UploadObjectInput,
  UploadObjectResult
} from './dto/storage-provider.types';

@Injectable()
export class GoogleDriveStorageProvider implements StorageProviderPort {
  readonly provider = Provider.GOOGLE_DRIVE;
  private static readonly RESUMABLE_THRESHOLD_BYTES = 5 * 1024 * 1024;
  private static readonly RESUMABLE_CHUNK_BYTES = 8 * 1024 * 1024;
  private static readonly MAX_CHUNK_ATTEMPTS = 3;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenEncryptionService: TokenEncryptionService
  ) {}

  async uploadObject(input: UploadObjectInput): Promise<UploadObjectResult> {
    if (input.sizeBytes > GoogleDriveStorageProvider.RESUMABLE_THRESHOLD_BYTES) {
      return this.uploadObjectResumable(input);
    }

    const drive = this.createDriveClient(input.integration);
    const parents = input.parentFolderId ? [input.parentFolderId] : undefined;

    try {
      const response = await drive.files.create({
        requestBody: {
          name: input.fileName,
          parents
        },
        media: {
          mimeType: input.contentType,
          body: input.createReadStream()
        },
        fields: 'id,name,mimeType,size'
      });

      if (!response.data.id) {
        throw new BadGatewayException('Google Drive did not return a file id');
      }

      return {
        providerFileId: response.data.id,
        fileName: response.data.name ?? input.fileName,
        contentType: response.data.mimeType ?? input.contentType,
        sizeBytes: response.data.size ? Number(response.data.size) : input.sizeBytes
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive upload failed');
    }
  }

  private async uploadObjectResumable(input: UploadObjectInput): Promise<UploadObjectResult> {
    const client = this.createOAuthClient(input.integration);
    let sessionResponse;
    try {
      sessionResponse = await client.request({
        url: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'resumable', fields: 'id,name,mimeType,size' },
        data: {
          name: input.fileName,
          parents: input.parentFolderId ? [input.parentFolderId] : undefined
        },
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': input.contentType,
          'X-Upload-Content-Length': String(input.sizeBytes)
        },
        timeout: getDriveChunkTimeoutMs()
      });
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive resumable session creation failed');
    }
    const sessionUrl = sessionResponse.headers.get('location');

    if (!sessionUrl) {
      throw new BadGatewayException('Google Drive did not return a resumable upload session');
    }

    let offset = 0;
    let uploadedFile: drive_v3.Schema$File | undefined;

    try {
      for await (const chunk of this.readChunks(input.createReadStream())) {
        const result = await this.uploadResumableChunk(client, sessionUrl, chunk, offset, input.sizeBytes);
        offset = result.nextOffset;
        uploadedFile = result.file ?? uploadedFile;
      }
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive resumable upload failed');
    }

    if (offset !== input.sizeBytes || !uploadedFile?.id) {
      throw new BadGatewayException('Google Drive resumable upload did not complete');
    }

    return {
      providerFileId: uploadedFile.id,
      fileName: uploadedFile.name ?? input.fileName,
      contentType: uploadedFile.mimeType ?? input.contentType,
      sizeBytes: uploadedFile.size ? Number(uploadedFile.size) : input.sizeBytes
    };
  }

  private async uploadResumableChunk(
    client: OAuth2Client,
    sessionUrl: string,
    chunk: Buffer,
    chunkOffset: number,
    totalSize: number
  ): Promise<{ nextOffset: number; file?: drive_v3.Schema$File }> {
    let attempt = 0;
    let offset = chunkOffset;

    while (offset < chunkOffset + chunk.length) {
      const body = chunk.subarray(offset - chunkOffset);
      const end = offset + body.length - 1;

      try {
        const response = await client.request<drive_v3.Schema$File>({
          url: sessionUrl,
          method: 'PUT',
          data: body,
          headers: {
            'Content-Length': String(body.length),
            'Content-Range': `bytes ${offset}-${end}/${totalSize}`
          },
          retry: false,
          timeout: getDriveChunkTimeoutMs(),
          validateStatus: (status) => (status >= 200 && status < 300) || status === 308
        });

        if (response.status !== 308) {
          return { nextOffset: totalSize, file: response.data };
        }

        offset = this.nextOffsetFromRange(response.headers.get('range'), chunkOffset + chunk.length);
        attempt = 0;
      } catch (error) {
        attempt += 1;
        if (attempt >= GoogleDriveStorageProvider.MAX_CHUNK_ATTEMPTS) {
          throw error;
        }

        const status = await this.queryResumableOffset(client, sessionUrl, totalSize);
        if (status.file) {
          return { nextOffset: totalSize, file: status.file };
        }
        offset = Math.max(offset, status.nextOffset);
        await this.delay(250 * 2 ** (attempt - 1));
      }
    }

    return { nextOffset: offset };
  }

  private async queryResumableOffset(
    client: OAuth2Client,
    sessionUrl: string,
    totalSize: number
  ): Promise<{ nextOffset: number; file?: drive_v3.Schema$File }> {
    const response = await client.request<drive_v3.Schema$File>({
      url: sessionUrl,
      method: 'PUT',
      data: Buffer.alloc(0),
      headers: { 'Content-Length': '0', 'Content-Range': `bytes */${totalSize}` },
      retry: false,
      timeout: getDriveChunkTimeoutMs(),
      validateStatus: (status) => (status >= 200 && status < 300) || status === 308
    });

    if (response.status !== 308) {
      return { nextOffset: totalSize, file: response.data };
    }

    return { nextOffset: this.nextOffsetFromRange(response.headers.get('range'), 0) };
  }

  private nextOffsetFromRange(range: string | null, fallback: number): number {
    const match = range?.match(/bytes=0-(\d+)/i);
    return match?.[1] ? Number(match[1]) + 1 : fallback;
  }

  private async *readChunks(stream: Readable): AsyncGenerator<Buffer> {
    let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0);

    for await (const value of stream) {
      const incoming = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      pending = pending.length === 0 ? incoming : Buffer.concat([pending, incoming]);

      while (pending.length >= GoogleDriveStorageProvider.RESUMABLE_CHUNK_BYTES) {
        yield pending.subarray(0, GoogleDriveStorageProvider.RESUMABLE_CHUNK_BYTES);
        pending = pending.subarray(GoogleDriveStorageProvider.RESUMABLE_CHUNK_BYTES);
      }
    }

    if (pending.length > 0) {
      yield pending;
    }
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async downloadObject(input: DownloadObjectInput): Promise<DownloadObjectResult> {
    const drive = this.createDriveClient(input.integration);

    try {
      const [metadata, file] = await Promise.all([
        drive.files.get({
          fileId: input.providerFileId,
          fields: 'name,mimeType,size'
        }),
        drive.files.get(
          {
            fileId: input.providerFileId,
            alt: 'media'
          },
          {
            responseType: 'stream'
          }
        )
      ]);

      return {
        stream: file.data as Readable,
        fileName: metadata.data.name ?? null,
        contentType: metadata.data.mimeType ?? null,
        sizeBytes: metadata.data.size ? Number(metadata.data.size) : null
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive download failed');
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const drive = this.createDriveClient(input.integration);

    try {
      await drive.files.delete({
        fileId: input.providerFileId
      });
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive delete failed');
    }
  }

  async findFolderByName(
    name: string,
    integration: StorageProviderIntegrationCredentials,
    parentFolderId?: string
  ): Promise<string | null> {
    const drive = this.createDriveClient(integration);
    const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const parentClause = parentFolderId ? `'${parentFolderId}' in parents` : `'root' in parents`;

    try {
      const response = await drive.files.list({
        q: `mimeType = 'application/vnd.google-apps.folder' and name = '${escapedName}' and ${parentClause} and trashed = false`,
        fields: 'files(id)',
        pageSize: 1
      });

      return response.data.files?.[0]?.id ?? null;
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive folder search failed');
    }
  }

  async createFolder(
    name: string,
    integration: StorageProviderIntegrationCredentials,
    parentFolderId?: string
  ): Promise<string> {
    const drive = this.createDriveClient(integration);
    const parents = parentFolderId ? [parentFolderId] : undefined;

    try {
      const response = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents
        },
        fields: 'id'
      });

      if (!response.data.id) {
        throw new BadGatewayException('Google Drive did not return a folder id');
      }

      return response.data.id;
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive folder creation failed');
    }
  }

  async findOrCreateFolder(
    name: string,
    integration: StorageProviderIntegrationCredentials,
    parentFolderId?: string
  ): Promise<string> {
    const existing = await this.findFolderByName(name, integration, parentFolderId);
    if (existing) {
      return existing;
    }
    return this.createFolder(name, integration, parentFolderId);
  }

  async isFolderUsable(
    folderId: string,
    integration: StorageProviderIntegrationCredentials
  ): Promise<boolean> {
    const drive = this.createDriveClient(integration);

    try {
      const response = await drive.files.get({ fileId: folderId, fields: 'id,trashed' });
      return response.data.trashed !== true;
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return false;
      }
      throw this.mapProviderError(error, 'Google Drive folder lookup failed');
    }
  }

  async getDriveQuota(
    integration: StorageProviderIntegrationCredentials
  ): Promise<{ limitBytes: string | null; usageBytes: string; usageInDriveBytes: string }> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.about.get({ fields: 'storageQuota' });
      const quota = response.data.storageQuota;
      return {
        limitBytes: quota?.limit ?? null,
        usageBytes: quota?.usage ?? '0',
        usageInDriveBytes: quota?.usageInDrive ?? '0'
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive quota fetch failed');
    }
  }

  private createDriveClient(integration: StorageProviderIntegrationCredentials): drive_v3.Drive {
    return google.drive({
      version: 'v3',
      auth: this.createOAuthClient(integration)
    });
  }

  private createOAuthClient(integration: StorageProviderIntegrationCredentials): OAuth2Client {
    const client = new OAuth2Client(
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI')
    );
    client.setCredentials({
      access_token: this.tokenEncryptionService.decrypt(integration.encryptedAccessToken),
      refresh_token: integration.encryptedRefreshToken
        ? this.tokenEncryptionService.decrypt(integration.encryptedRefreshToken)
        : undefined,
      expiry_date: integration.tokenExpiresAt?.getTime()
    });

    return client;
  }

  private isNotFoundError(error: unknown): boolean {
    const status = (error as { code?: number | string; response?: { status?: number } })?.response?.status
      ?? (error as { code?: number | string })?.code;

    if (status === 404 || status === '404') {
      return true;
    }

    return error instanceof Error && error.message.toLowerCase().includes('not found');
  }

  private mapProviderError(error: unknown, fallbackMessage: string): BadGatewayException {
    if (error instanceof BadGatewayException) {
      return error;
    }

    if (error instanceof Error && error.message) {
      return new BadGatewayException(`${fallbackMessage}: ${error.message}`);
    }

    return new BadGatewayException(fallbackMessage);
  }
}
