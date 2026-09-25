import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Provider, ProviderIntegrationStatus, Sid3RootFolderStatus } from '@prisma/client';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageProviderRegistry } from '../storage-providers/storage-provider.registry';
import { GoogleOAuthClient } from './google-oauth.client';
import { ConnectionsService } from './connections.service';

type UserDelegateMock = {
  findUnique: jest.Mock;
};

type OAuthStateDelegateMock = {
  create: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
};

type ProviderIntegrationDelegateMock = {
  create: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
};

describe(ConnectionsService.name, () => {
  const userId = '1b56a466-526f-43c8-a662-919994e0c876';
  const createdAt = new Date('2026-05-24T13:00:00.000Z');
  const persistedConnection = {
    id: '5817530b-6388-4e7c-910d-387c8a5f9eda',
    provider: Provider.GOOGLE_DRIVE,
    displayName: null,
    providerAccountEmail: null,
    status: ProviderIntegrationStatus.CONNECTED,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
    sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED,
    createdAt
  };

  let userDelegate: UserDelegateMock;
  let oauthStateDelegate: OAuthStateDelegateMock;
  let providerIntegrationDelegate: ProviderIntegrationDelegateMock;
  let googleOAuthClient: jest.Mocked<Pick<GoogleOAuthClient, 'createAuthorizationUrl' | 'exchangeCode'>>;
  let tokenEncryptionService: jest.Mocked<Pick<TokenEncryptionService, 'encrypt' | 'decrypt'>>;
  let storageProviderRegistry: jest.Mocked<Pick<StorageProviderRegistry, 'getProvider'>>;
  let service: ConnectionsService;

  beforeEach(() => {
    userDelegate = {
      findUnique: jest.fn().mockResolvedValue({ id: userId })
    };
    oauthStateDelegate = {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    };
    providerIntegrationDelegate = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    };
    googleOAuthClient = {
      createAuthorizationUrl: jest.fn((state: string) => `https://google.test/oauth?state=${state}`),
      exchangeCode: jest.fn()
    };
    tokenEncryptionService = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn()
    };
    storageProviderRegistry = {
      getProvider: jest.fn()
    };

    const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        oAuthState: oauthStateDelegate,
        providerIntegration: providerIntegrationDelegate
      })
    );

    const prisma = {
      user: userDelegate,
      oAuthState: oauthStateDelegate,
      providerIntegration: providerIntegrationDelegate,
      $transaction: transaction
    } as unknown as PrismaService;

    service = new ConnectionsService(
      prisma,
      googleOAuthClient as unknown as GoogleOAuthClient,
      tokenEncryptionService as unknown as TokenEncryptionService,
      storageProviderRegistry as unknown as StorageProviderRegistry
    );
  });

  it('creates a Google authorization URL and persists a hashed OAuth state', async () => {
    const response = await service.createGoogleAuthorizationUrl(userId);

    expect(oauthStateDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        redirectUri: 'google',
        expiresAt: expect.any(Date)
      })
    });
    expect(response.authorizationUrl).toContain('https://google.test/oauth?state=');
    expect(Date.parse(response.stateExpiresAt)).not.toBeNaN();
  });

  it('completes Google connection by consuming state and storing encrypted tokens', async () => {
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id' });
    googleOAuthClient.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiryDate: new Date('2026-05-24T14:00:00.000Z'),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    providerIntegrationDelegate.create.mockResolvedValue(persistedConnection);

    const response = await service.completeGoogleConnection(userId, {
      code: 'google-code',
      state: 'state-value-with-enough-length-123456'
    });

    expect(oauthStateDelegate.update).toHaveBeenCalledWith({
      where: { id: 'oauth-state-id' },
      data: { consumedAt: expect.any(Date) }
    });
    expect(providerIntegrationDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        provider: Provider.GOOGLE_DRIVE,
        displayName: null,
        encryptedAccessToken: 'encrypted:access-token',
        encryptedRefreshToken: 'encrypted:refresh-token',
        scopes: ['https://www.googleapis.com/auth/drive.file']
      }),
      select: expect.any(Object)
    });
    expect(response).toEqual({
      id: persistedConnection.id,
      provider: Provider.GOOGLE_DRIVE,
      displayName: null,
      providerAccountEmail: null,
      status: ProviderIntegrationStatus.CONNECTED,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED,
      createdAt: createdAt.toISOString()
    });
  });

  it('creates a second Google connection for the same user without upsert', async () => {
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id-2' });
    googleOAuthClient.exchangeCode.mockResolvedValue({
      accessToken: 'access-token-2',
      refreshToken: null,
      expiryDate: null,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    providerIntegrationDelegate.create.mockResolvedValue({
      ...persistedConnection,
      id: 'second-connection-id'
    });

    await service.completeGoogleConnection(userId, {
      code: 'google-code-2',
      state: 'state-value-with-enough-length-654321'
    });

    expect(providerIntegrationDelegate.create).toHaveBeenCalledTimes(1);
    expect(providerIntegrationDelegate.findFirst).not.toHaveBeenCalled();
    expect(providerIntegrationDelegate.update).not.toHaveBeenCalled();
  });

  it('rejects callback when OAuth state is invalid or expired', async () => {
    oauthStateDelegate.findFirst.mockResolvedValue(null);

    await expect(
      service.completeGoogleConnection(userId, {
        code: 'google-code',
        state: 'state-value-with-enough-length-123456'
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('loads OAuth diagnostics when the state hash exists but is already consumed or expired', async () => {
    oauthStateDelegate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'consumed-state-id',
        consumedAt: new Date('2026-05-24T13:10:00.000Z'),
        expiresAt: new Date(Date.now() - 60_000)
      });

    await expect(
      service.completeGoogleConnection(userId, {
        code: 'google-code',
        state: 'state-value-with-enough-length-123456'
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(oauthStateDelegate.findFirst).toHaveBeenCalledTimes(2);
  });

  it('rethrows provider exchange errors after logging the callback failure', async () => {
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id' });
    googleOAuthClient.exchangeCode.mockRejectedValue(new Error('oauth exchange failed code=abc123'));

    await expect(
      service.completeGoogleConnection(userId, {
        code: 'google-code',
        state: 'state-value-with-enough-length-123456'
      })
    ).rejects.toThrow('oauth exchange failed code=abc123');
  });

  it('lists connections owned by the authenticated user', async () => {
    providerIntegrationDelegate.findMany.mockResolvedValue([persistedConnection]);

    const response = await service.listConnections(userId);

    expect(providerIntegrationDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        orderBy: { createdAt: 'asc' }
      })
    );
    expect(response).toHaveLength(1);
    expect(response.at(0)?.displayName).toBeNull();
  });

  describe('updateConnection', () => {
    it('updates the displayName of a connection', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue({ id: persistedConnection.id });
      providerIntegrationDelegate.update.mockResolvedValue({
        ...persistedConnection,
        displayName: 'Drive pessoal'
      });

      const response = await service.updateConnection(userId, persistedConnection.id, {
        displayName: 'Drive pessoal'
      });

      expect(providerIntegrationDelegate.update).toHaveBeenCalledWith({
        where: { id: persistedConnection.id },
        data: { displayName: 'Drive pessoal' },
        select: expect.any(Object)
      });
      expect(response.displayName).toBe('Drive pessoal');
    });

    it('clears displayName when null is provided', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue({ id: persistedConnection.id });
      providerIntegrationDelegate.update.mockResolvedValue(persistedConnection);

      await service.updateConnection(userId, persistedConnection.id, { displayName: null });

      expect(providerIntegrationDelegate.update).toHaveBeenCalledWith({
        where: { id: persistedConnection.id },
        data: { displayName: null },
        select: expect.any(Object)
      });
    });

    it('rejects update for connection outside the current user', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.updateConnection(userId, persistedConnection.id, { displayName: 'Test' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('revokes an owned connection', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue({ id: persistedConnection.id });
    providerIntegrationDelegate.update.mockResolvedValue({
      ...persistedConnection,
      status: ProviderIntegrationStatus.REVOKED
    });

    const response = await service.revokeConnection(userId, persistedConnection.id);

    expect(providerIntegrationDelegate.update).toHaveBeenCalledWith({
      where: { id: persistedConnection.id },
      data: {
        status: ProviderIntegrationStatus.REVOKED,
        revokedAt: expect.any(Date)
      },
      select: expect.any(Object)
    });
    expect(response.status).toBe(ProviderIntegrationStatus.REVOKED);
  });

  it('rejects revoke for connections outside the current user', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue(null);

    await expect(service.revokeConnection(userId, persistedConnection.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects stale tokens whose user no longer exists', async () => {
    userDelegate.findUnique.mockResolvedValue(null);

    await expect(service.listConnections(userId)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects Google authorization URL creation when user no longer exists', async () => {
    userDelegate.findUnique.mockResolvedValue(null);

    await expect(service.createGoogleAuthorizationUrl(userId)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('confirmSid3RootFolder', () => {
    const pendingConnection = {
      ...persistedConnection,
      encryptedAccessToken: 'encrypted:access-token',
      encryptedRefreshToken: 'encrypted:refresh-token',
      tokenExpiresAt: null,
      sid3RootFolderStatus: Sid3RootFolderStatus.PENDING_CONFIRMATION
    };

    it('confirms reuse of the pre-existing sid3 folder', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue(pendingConnection);
      providerIntegrationDelegate.update.mockResolvedValue({
        ...persistedConnection,
        sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
      });

      const response = await service.confirmSid3RootFolder(userId, persistedConnection.id, { decision: 'CONFIRM' });

      expect(providerIntegrationDelegate.update).toHaveBeenCalledWith({
        where: { id: persistedConnection.id },
        data: { sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED },
        select: expect.any(Object)
      });
      expect(storageProviderRegistry.getProvider).not.toHaveBeenCalled();
      expect(response.sid3RootFolderStatus).toBe(Sid3RootFolderStatus.CONFIRMED);
    });

    it('declines the pre-existing folder and creates a new one via the storage provider', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue(pendingConnection);
      const createFolder = jest.fn().mockResolvedValue('new-sid3-folder-id');
      storageProviderRegistry.getProvider.mockReturnValue({ createFolder } as never);
      providerIntegrationDelegate.update.mockResolvedValue({
        ...persistedConnection,
        sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
      });

      const response = await service.confirmSid3RootFolder(userId, persistedConnection.id, { decision: 'DECLINE' });

      expect(createFolder).toHaveBeenCalledWith('sid3', pendingConnection);
      expect(providerIntegrationDelegate.update).toHaveBeenCalledWith({
        where: { id: persistedConnection.id },
        data: { sid3RootFolderRef: 'new-sid3-folder-id', sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED },
        select: expect.any(Object)
      });
      expect(response.sid3RootFolderStatus).toBe(Sid3RootFolderStatus.CONFIRMED);
    });

    it('rejects confirmation when there is no pending sid3 folder', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue({
        ...pendingConnection,
        sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
      });

      await expect(
        service.confirmSid3RootFolder(userId, persistedConnection.id, { decision: 'CONFIRM' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects confirmation for connections outside the current user', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.confirmSid3RootFolder(userId, persistedConnection.id, { decision: 'CONFIRM' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
