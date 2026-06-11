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
  content: Buffer;
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
