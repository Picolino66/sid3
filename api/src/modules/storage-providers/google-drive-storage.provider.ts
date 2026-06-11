import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@prisma/client';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import { Readable } from 'stream';
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

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenEncryptionService: TokenEncryptionService
  ) {}

  async uploadObject(input: UploadObjectInput): Promise<UploadObjectResult> {
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
          body: Readable.from(input.content)
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
        sizeBytes: response.data.size ? Number(response.data.size) : input.content.byteLength
      };
    } catch (error) {
      throw this.mapProviderError(error, 'Google Drive upload failed');
    }
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

  private createDriveClient(integration: StorageProviderIntegrationCredentials): drive_v3.Drive {
    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: this.tokenEncryptionService.decrypt(integration.encryptedAccessToken),
      refresh_token: integration.encryptedRefreshToken
        ? this.tokenEncryptionService.decrypt(integration.encryptedRefreshToken)
        : undefined,
      expiry_date: integration.tokenExpiresAt?.getTime()
    });

    return google.drive({
      version: 'v3',
      auth: client
    });
  }

  private createOAuthClient(): OAuth2Client {
    return new OAuth2Client(
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_ID'),
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.configService.getOrThrow<string>('GOOGLE_OAUTH_REDIRECT_URI')
    );
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
