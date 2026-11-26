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
  DriveChange,
  DriveChangesPage,
  DriveFileContent,
  DriveFilesPage,
  DriveIndexedFile,
  DriveSharedDrivesPage,
  StorageProviderIntegrationCredentials,
  StorageProviderPort,
  UploadObjectInput,
  UploadObjectResult
} from './dto/storage-provider.types';

export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const DRIVE_FILE_FIELDS = 'id,name,mimeType,size,parents,driveId,md5Checksum,modifiedTime,webViewLink,trashed,ownedByMe';
const SHARED_DRIVES_PAGE_SIZE = 100;
const DRIVE_LIST_PAGE_SIZE = 1000;

/** Formato de exportação para arquivos nativos do Google (Docs, Planilhas, Apresentações, Desenhos). */
export const GOOGLE_WORKSPACE_EXPORT_FORMATS: Record<string, { mimeType: string; extension: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extension: 'docx'
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx'
  },
  'application/vnd.google-apps.presentation': {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx'
  },
  'application/vnd.google-apps.drawing': { mimeType: 'image/png', extension: 'png' }
};

export function isDriveFolderMimeType(mimeType: string): boolean {
  return mimeType === DRIVE_FOLDER_MIME_TYPE;
}

/** Arquivo é baixável se tiver conteúdo binário ou se for um formato nativo do Google exportável. */
export function isDriveFileDownloadable(mimeType: string): boolean {
  if (!mimeType.startsWith('application/vnd.google-apps.')) {
    return true;
  }
  return mimeType in GOOGLE_WORKSPACE_EXPORT_FORMATS;
}

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

  /** Conta Google dona dos tokens. `permissionId` é estável e não muda se o e-mail mudar. */
  async getAccountIdentity(
    integration: StorageProviderIntegrationCredentials
  ): Promise<{ accountId: string; email: string | null }> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.about.get({ fields: 'user(emailAddress,permissionId)' });
      const accountId = response.data.user?.permissionId;
      if (!accountId) {
        throw new BadGatewayException('Google Drive did not return the account id');
      }
      return { accountId, email: response.data.user?.emailAddress ?? null };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive account lookup failed');
    }
  }

  /** Revoga no Google o acesso concedido ao SID3. Falha silenciosamente se o token já estiver inválido. */
  async revokeAuthorization(integration: StorageProviderIntegrationCredentials): Promise<boolean> {
    try {
      const client = this.createOAuthClient(integration);
      const token = integration.encryptedRefreshToken
        ? this.tokenEncryptionService.decrypt(integration.encryptedRefreshToken)
        : this.tokenEncryptionService.decrypt(integration.encryptedAccessToken);
      await client.revokeToken(token);
      return true;
    } catch {
      return false;
    }
  }

  async getRootFolderId(integration: StorageProviderIntegrationCredentials): Promise<string> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.files.get({ fileId: 'root', fields: 'id' });
      if (!response.data.id) {
        throw new BadGatewayException('Google Drive did not return the root folder id');
      }
      return response.data.id;
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive root folder lookup failed');
    }
  }

  async getChangesStartPageToken(integration: StorageProviderIntegrationCredentials): Promise<string> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.changes.getStartPageToken({ supportsAllDrives: true });
      if (!response.data.startPageToken) {
        throw new BadGatewayException('Google Drive did not return a changes start page token');
      }
      return response.data.startPageToken;
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive changes token fetch failed');
    }
  }

  /**
   * Lista uma página de arquivos não excluídos. Sem driveId: "Meu Drive" e "Compartilhados comigo";
   * com driveId: o conteúdo daquele drive compartilhado.
   */
  async listFilesPage(
    integration: StorageProviderIntegrationCredentials,
    pageToken?: string | null,
    driveId?: string
  ): Promise<DriveFilesPage> {
    const drive = this.createDriveClient(integration);
    const corpusParams = driveId
      ? { corpora: 'drive', driveId, includeItemsFromAllDrives: true }
      : // Inclui itens de drives compartilhados que foram compartilhados diretamente com o usuário,
        // mesmo sem ele ser membro do drive (esses drives não aparecem em drives.list).
        { corpora: 'user', includeItemsFromAllDrives: true };

    try {
      const response = await drive.files.list({
        q: 'trashed = false',
        spaces: 'drive',
        ...corpusParams,
        supportsAllDrives: true,
        pageSize: DRIVE_LIST_PAGE_SIZE,
        pageToken: pageToken ?? undefined,
        fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`
      });

      return {
        files: (response.data.files ?? []).flatMap((file) => this.toIndexedFile(file) ?? []),
        nextPageToken: response.data.nextPageToken ?? null
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive file listing failed');
    }
  }

  /**
   * Lista o conteúdo direto de uma pasta. Necessário para pastas compartilhadas comigo: o corpus "user"
   * só traz arquivos meus, abertos por mim ou compartilhados diretamente comigo, então o conteúdo de uma
   * pasta de outra pessoa só aparece consultando pelo pai. Uma pasta por consulta: com várias pastas
   * unidas por "or", o Google devolve só os itens que já estão no corpus do usuário.
   */
  async listFolderChildrenPage(
    integration: StorageProviderIntegrationCredentials,
    folderId: string,
    pageToken?: string | null
  ): Promise<DriveFilesPage> {
    const drive = this.createDriveClient(integration);
    const escapedId = folderId.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    try {
      const response = await drive.files.list({
        q: `'${escapedId}' in parents and trashed = false`,
        spaces: 'drive',
        corpora: 'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: DRIVE_LIST_PAGE_SIZE,
        pageToken: pageToken ?? undefined,
        fields: `nextPageToken,files(${DRIVE_FILE_FIELDS})`
      });

      return {
        files: (response.data.files ?? []).flatMap((file) => this.toIndexedFile(file) ?? []),
        nextPageToken: response.data.nextPageToken ?? null
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive folder listing failed');
    }
  }

  /** Lista os drives compartilhados dos quais o usuário é membro. */
  async listSharedDrivesPage(
    integration: StorageProviderIntegrationCredentials,
    pageToken?: string | null
  ): Promise<DriveSharedDrivesPage> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.drives.list({
        pageSize: SHARED_DRIVES_PAGE_SIZE,
        pageToken: pageToken ?? undefined,
        fields: 'nextPageToken,drives(id,name)'
      });

      return {
        drives: (response.data.drives ?? []).flatMap((sharedDrive) =>
          sharedDrive.id ? [{ driveId: sharedDrive.id, name: sharedDrive.name ?? '(drive sem nome)' }] : []
        ),
        nextPageToken: response.data.nextPageToken ?? null
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive shared drives listing failed');
    }
  }

  async listChangesPage(
    integration: StorageProviderIntegrationCredentials,
    pageToken: string
  ): Promise<DriveChangesPage> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.changes.list({
        pageToken,
        spaces: 'drive',
        includeRemoved: true,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: DRIVE_LIST_PAGE_SIZE,
        fields: `nextPageToken,newStartPageToken,changes(changeType,fileId,driveId,removed,drive(id,name),file(${DRIVE_FILE_FIELDS}))`
      });

      return {
        changes: (response.data.changes ?? []).flatMap((change): DriveChange[] => {
          if (change.changeType === 'drive') {
            if (!change.driveId) {
              return [];
            }
            const sharedDrive = change.drive?.id
              ? { driveId: change.drive.id, name: change.drive.name ?? '(drive sem nome)' }
              : null;
            return [
              { kind: 'drive', driveId: change.driveId, removed: change.removed === true || !sharedDrive, drive: sharedDrive }
            ];
          }
          if (!change.fileId) {
            return [];
          }
          const file = change.file ? this.toIndexedFile(change.file) : null;
          return [{ kind: 'file', providerFileId: change.fileId, removed: change.removed === true || file === null, file }];
        }),
        nextPageToken: response.data.nextPageToken ?? null,
        newStartPageToken: response.data.newStartPageToken ?? null
      };
    } catch (error) {
      if (this.isInvalidPageTokenError(error)) {
        throw new DriveChangesTokenExpiredError();
      }
      throw this.mapProviderError(error, 'Google Drive changes listing failed');
    }
  }

  /** Baixa o conteúdo de um arquivo; formatos nativos do Google são exportados para Office/PNG. */
  async downloadDriveFile(
    integration: StorageProviderIntegrationCredentials,
    file: { providerFileId: string; name: string; mimeType: string; sizeBytes: number | null },
    options: { range?: string } = {}
  ): Promise<DriveFileContent> {
    const drive = this.createDriveClient(integration);
    const exportFormat = GOOGLE_WORKSPACE_EXPORT_FORMATS[file.mimeType];

    try {
      if (exportFormat) {
        const exported = await drive.files.export(
          { fileId: file.providerFileId, mimeType: exportFormat.mimeType },
          { responseType: 'stream' }
        );
        return {
          stream: exported.data as Readable,
          contentType: exportFormat.mimeType,
          fileName: this.withExtension(file.name, exportFormat.extension),
          sizeBytes: null
        };
      }

      const media = await drive.files.get(
        { fileId: file.providerFileId, alt: 'media', acknowledgeAbuse: false, supportsAllDrives: true },
        { responseType: 'stream', ...(options.range ? { headers: { Range: options.range } } : {}) }
      );
      const contentRange = this.readHeader(media.headers, 'content-range');
      const contentLength = Number(this.readHeader(media.headers, 'content-length'));
      return {
        stream: media.data as Readable,
        contentType: file.mimeType || 'application/octet-stream',
        fileName: file.name,
        sizeBytes: file.sizeBytes,
        ...(media.status === 206 && contentRange
          ? { partial: { contentRange, contentLength: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null } }
          : {})
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive file download failed');
    }
  }

  /** Duração do vídeo segundo o Google Drive (nula se o Drive ainda não processou o vídeo). */
  async getVideoDurationMs(integration: StorageProviderIntegrationCredentials, providerFileId: string): Promise<number | null> {
    const drive = this.createDriveClient(integration);
    try {
      const response = await drive.files.get({
        fileId: providerFileId,
        supportsAllDrives: true,
        fields: 'videoMediaMetadata(durationMillis)'
      });
      const duration = Number(response.data.videoMediaMetadata?.durationMillis);
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive video metadata fetch failed');
    }
  }

  /** Os headers da resposta podem vir como objeto simples ou como Headers (fetch), conforme a versão do gaxios. */
  private readHeader(headers: unknown, name: string): string | null {
    if (!headers) {
      return null;
    }
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const value = (headers as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : null;
  }

  private toIndexedFile(file: drive_v3.Schema$File): DriveIndexedFile | null {
    if (!file.id || file.trashed === true) {
      return null;
    }

    return {
      providerFileId: file.id,
      parentFileId: file.parents?.[0] ?? null,
      driveId: file.driveId ?? null,
      name: file.name ?? '(sem nome)',
      mimeType: file.mimeType ?? 'application/octet-stream',
      sizeBytes: file.size ? BigInt(file.size) : null,
      md5Checksum: file.md5Checksum ?? null,
      modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : null,
      webViewLink: file.webViewLink ?? null,
      ownedByMe: typeof file.ownedByMe === 'boolean' ? file.ownedByMe : null
    };
  }

  private withExtension(name: string, extension: string): string {
    return name.toLowerCase().endsWith(`.${extension}`) ? name : `${name}.${extension}`;
  }

  private isInvalidPageTokenError(error: unknown): boolean {
    const status = (error as { response?: { status?: number } })?.response?.status
      ?? Number((error as { code?: number | string })?.code);
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (status === 400 || status === 410) && message.includes('token');
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

    if (isDriveAuthorizationFailure(error)) {
      return new DriveAuthorizationError();
    }

    if (error instanceof Error && error.message) {
      return new BadGatewayException(`${fallbackMessage}: ${error.message}`);
    }

    return new BadGatewayException(fallbackMessage);
  }
}

/** O Google recusou os tokens (revogados, expirados ou sem permissão): a conexão precisa ser reconectada. */
export class DriveAuthorizationError extends BadGatewayException {
  constructor() {
    super('A autorização do Google Drive expirou ou foi revogada. Reconecte a conta em Conexões.');
    this.name = 'DriveAuthorizationError';
  }
}

export function isDriveAuthorizationFailure(error: unknown): boolean {
  if (error instanceof DriveAuthorizationError) {
    return true;
  }
  const status = (error as { response?: { status?: number } })?.response?.status
    ?? (error as { code?: number | string })?.code;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const responseError = String((error as { response?: { data?: { error?: unknown } } })?.response?.data?.error ?? '');
  return (
    status === 401 ||
    status === '401' ||
    message.includes('invalid_grant') ||
    message.includes('invalid credentials') ||
    message.includes('no refresh token') ||
    responseError === 'invalid_grant'
  );
}

/** O token da Changes API expirou ou é inválido; é preciso refazer a varredura completa. */
export class DriveChangesTokenExpiredError extends Error {
  constructor() {
    super('Google Drive changes page token is no longer valid');
    this.name = 'DriveChangesTokenExpiredError';
  }
}
