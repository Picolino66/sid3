import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Provider } from '@prisma/client';
import { Readable } from 'stream';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { GoogleDriveStorageProvider } from './google-drive-storage.provider';

const driveCreate = jest.fn();
const driveGet = jest.fn();
const driveDelete = jest.fn();
const setCredentials = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(() => ({
      files: {
        create: driveCreate,
        get: driveGet,
        delete: driveDelete
      }
    }))
  }
}));

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    setCredentials
  }))
}));

describe(GoogleDriveStorageProvider.name, () => {
  const integration = {
    provider: Provider.GOOGLE_DRIVE,
    encryptedAccessToken: 'encrypted-access',
    encryptedRefreshToken: 'encrypted-refresh',
    tokenExpiresAt: new Date('2026-05-24T14:00:00.000Z')
  };

  let provider: GoogleDriveStorageProvider;
  let tokenEncryptionService: jest.Mocked<Pick<TokenEncryptionService, 'decrypt'>>;

  beforeEach(() => {
    jest.clearAllMocks();

    const configService = {
      getOrThrow: jest.fn((key: string) => `${key}-value`)
    } as unknown as ConfigService;
    tokenEncryptionService = {
      decrypt: jest.fn((value: string) => value.replace('encrypted-', ''))
    };

    provider = new GoogleDriveStorageProvider(
      configService,
      tokenEncryptionService as unknown as TokenEncryptionService
    );
  });

  it('uploads an object through Google Drive and returns provider metadata', async () => {
    driveCreate.mockResolvedValue({
      data: {
        id: 'google-file-id',
        name: 'avatar.png',
        mimeType: 'image/png',
        size: '4'
      }
    });

    const response = await provider.uploadObject({
      integration,
      fileName: 'avatar.png',
      contentType: 'image/png',
      content: Buffer.from('file'),
      parentFolderId: 'folder-id'
    });

    expect(setCredentials).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: 'refresh',
      expiry_date: integration.tokenExpiresAt.getTime()
    });
    expect(driveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          name: 'avatar.png',
          parents: ['folder-id']
        },
        media: expect.objectContaining({
          mimeType: 'image/png'
        }),
        fields: 'id,name,mimeType,size'
      })
    );
    expect(response).toEqual({
      providerFileId: 'google-file-id',
      fileName: 'avatar.png',
      contentType: 'image/png',
      sizeBytes: 4
    });
  });

  it('uploads an object without parent folder and falls back to input metadata', async () => {
    driveCreate.mockResolvedValue({
      data: {
        id: 'google-file-id-2'
      }
    });

    const response = await provider.uploadObject({
      integration: {
        ...integration,
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      },
      fileName: 'notes.txt',
      contentType: 'text/plain',
      content: Buffer.from('hello')
    });

    expect(setCredentials).toHaveBeenCalledWith({
      access_token: 'access',
      refresh_token: undefined,
      expiry_date: undefined
    });
    expect(driveCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          name: 'notes.txt',
          parents: undefined
        }
      })
    );
    expect(response).toEqual({
      providerFileId: 'google-file-id-2',
      fileName: 'notes.txt',
      contentType: 'text/plain',
      sizeBytes: Buffer.from('hello').byteLength
    });
  });

  it('downloads an object stream and metadata', async () => {
    const stream = Readable.from(Buffer.from('file'));
    driveGet
      .mockResolvedValueOnce({
        data: {
          name: 'avatar.png',
          mimeType: 'image/png',
          size: '4'
        }
      })
      .mockResolvedValueOnce({
        data: stream
      });

    const response = await provider.downloadObject({
      integration,
      providerFileId: 'google-file-id'
    });

    expect(response).toEqual({
      stream,
      fileName: 'avatar.png',
      contentType: 'image/png',
      sizeBytes: 4
    });
  });

  it('downloads an object with nullable metadata fallback', async () => {
    const stream = Readable.from(Buffer.from('file'));
    driveGet
      .mockResolvedValueOnce({
        data: {}
      })
      .mockResolvedValueOnce({
        data: stream
      });

    const response = await provider.downloadObject({
      integration,
      providerFileId: 'google-file-id'
    });

    expect(response).toEqual({
      stream,
      fileName: null,
      contentType: null,
      sizeBytes: null
    });
  });

  it('deletes an object through Google Drive', async () => {
    driveDelete.mockResolvedValue({});

    await provider.deleteObject({
      integration,
      providerFileId: 'google-file-id'
    });

    expect(driveDelete).toHaveBeenCalledWith({
      fileId: 'google-file-id'
    });
  });

  it('maps provider failures to bad gateway errors', async () => {
    driveCreate.mockRejectedValue(new Error('quota exceeded'));

    await expect(
      provider.uploadObject({
        integration,
        fileName: 'avatar.png',
        contentType: 'image/png',
        content: Buffer.from('file')
      })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('rethrows existing bad gateway errors without wrapping again', async () => {
    driveDelete.mockRejectedValue(new BadGatewayException('Google Drive delete failed'));

    await expect(
      provider.deleteObject({
        integration,
        providerFileId: 'google-file-id'
      })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('fails upload when Google Drive does not return a file id', async () => {
    driveCreate.mockResolvedValue({
      data: {
        name: 'avatar.png'
      }
    });

    await expect(
      provider.uploadObject({
        integration,
        fileName: 'avatar.png',
        contentType: 'image/png',
        content: Buffer.from('file')
      })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
