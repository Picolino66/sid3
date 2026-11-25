import { Readable } from 'stream';
import { Provider } from '@prisma/client';

export type StorageProviderIntegrationCredentials = {
  provider: Provider;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
};

export type UploadObjectInput = {
  integration: StorageProviderIntegrationCredentials;
  fileName: string;
  contentType: string;
  createReadStream: () => Readable;
  sizeBytes: number;
  parentFolderId?: string | null;
};

export type UploadObjectResult = {
  providerFileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

export type DownloadObjectInput = {
  integration: StorageProviderIntegrationCredentials;
  providerFileId: string;
};

export type DownloadObjectResult = {
  stream: Readable;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
};

export type DeleteObjectInput = {
  integration: StorageProviderIntegrationCredentials;
  providerFileId: string;
};

export interface StorageProviderPort {
  readonly provider: Provider;
  uploadObject(input: UploadObjectInput): Promise<UploadObjectResult>;
  downloadObject(input: DownloadObjectInput): Promise<DownloadObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
}

export type DriveIndexedFile = {
  providerFileId: string;
  parentFileId: string | null;
  /** ID do drive compartilhado que contém o item; nulo para itens de "Meu Drive". */
  driveId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: bigint | null;
  md5Checksum: string | null;
  modifiedTime: Date | null;
  webViewLink: string | null;
  /** Falso quando o item pertence a outra pessoa; nulo quando o Google não informa (drives compartilhados). */
  ownedByMe: boolean | null;
};

export type DriveFilesPage = {
  files: DriveIndexedFile[];
  nextPageToken: string | null;
};

export type DriveSharedDrive = {
  driveId: string;
  name: string;
};

export type DriveSharedDrivesPage = {
  drives: DriveSharedDrive[];
  nextPageToken: string | null;
};

/** Mudança num arquivo/pasta, ou no próprio drive compartilhado (renomeado, removido, acesso perdido). */
export type DriveChange =
  | { kind: 'file'; providerFileId: string; removed: boolean; file: DriveIndexedFile | null }
  | { kind: 'drive'; driveId: string; removed: boolean; drive: DriveSharedDrive | null };

export type DriveChangesPage = {
  changes: DriveChange[];
  nextPageToken: string | null;
  newStartPageToken: string | null;
};

export type DriveFileContent = {
  stream: Readable;
  contentType: string;
  fileName: string;
  sizeBytes: number | null;
  /** Presente quando um intervalo de bytes (header Range) foi pedido e o Google respondeu 206. */
  partial?: { contentRange: string; contentLength: number | null };
};
