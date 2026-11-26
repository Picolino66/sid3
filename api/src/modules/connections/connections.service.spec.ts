import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Provider, ProviderIntegrationStatus, Sid3RootFolderStatus } from '@prisma/client';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { DriveIndexSyncService } from '../drive-index/drive-index-sync.service';
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
  count: jest.Mock;
  delete: jest.Mock;
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
    lastError: null,
    lastErrorAt: null,
    projectLinks: [],
    createdAt
  };

  let userDelegate: UserDelegateMock;
  let oauthStateDelegate: OAuthStateDelegateMock;
  let providerIntegrationDelegate: ProviderIntegrationDelegateMock;
  let googleOAuthClient: jest.Mocked<Pick<GoogleOAuthClient, 'createAuthorizationUrl' | 'exchangeCode'>>;
  let tokenEncryptionService: jest.Mocked<Pick<TokenEncryptionService, 'encrypt' | 'decrypt'>>;
  let storageProviderRegistry: jest.Mocked<Pick<StorageProviderRegistry, 'getProvider'>>;
  let driveIndexSyncService: jest.Mocked<Pick<DriveIndexSyncService, 'requestRefresh'>>;
  let service: ConnectionsService;
  let bucketCount: jest.Mock;
  let objectCount: jest.Mock;
  let driveProvider: { getAccountIdentity: jest.Mock; revokeAuthorization: jest.Mock; createFolder: jest.Mock };

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
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      delete: jest.fn()
    };
    googleOAuthClient = {
      createAuthorizationUrl: jest.fn((state: string) => `https://google.test/oauth?state=${state}`),
      exchangeCode: jest.fn()
    };
    tokenEncryptionService = {
      encrypt: jest.fn((value: string) => `encrypted:${value}`),
      decrypt: jest.fn()
    };
    driveProvider = {
      getAccountIdentity: jest.fn().mockResolvedValue({ accountId: 'google-account-1', email: 'me@example.com' }),
      revokeAuthorization: jest.fn().mockResolvedValue(true),
      createFolder: jest.fn()
    };
    storageProviderRegistry = {
      getProvider: jest.fn().mockReturnValue(driveProvider)
    };
    driveIndexSyncService = {
      requestRefresh: jest.fn().mockResolvedValue(undefined)
    };

    const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        oAuthState: oauthStateDelegate,
        providerIntegration: providerIntegrationDelegate
      })
    );

    bucketCount = jest.fn().mockResolvedValue(0);
    objectCount = jest.fn().mockResolvedValue(0);
    const prisma = {
      user: userDelegate,
      oAuthState: oauthStateDelegate,
      providerIntegration: providerIntegrationDelegate,
      bucket: { count: bucketCount },
      storagePoolMember: { count: jest.fn().mockResolvedValue(0) },
      storageObject: { count: objectCount },
      $transaction: transaction
    } as unknown as PrismaService;

    service = new ConnectionsService(
      prisma,
      googleOAuthClient as unknown as GoogleOAuthClient,
      tokenEncryptionService as unknown as TokenEncryptionService,
      storageProviderRegistry as unknown as StorageProviderRegistry,
      driveIndexSyncService as unknown as DriveIndexSyncService
    );
  });

  it('creates a Google authorization URL and persists a hashed OAuth state', async () => {
    const response = await service.createGoogleAuthorizationUrl(userId);

    expect(oauthStateDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId,
        stateHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        redirectUri: 'google',
        displayName: 'GOOGLE_DRIVE',
        expiresAt: expect.any(Date)
      })
    });
    expect(response.authorizationUrl).toContain('https://google.test/oauth?state=');
    expect(Date.parse(response.stateExpiresAt)).not.toBeNaN();
  });

  it('persists the chosen (trimmed) connection name in the OAuth state', async () => {
    await service.createGoogleAuthorizationUrl(userId, '  Drive da Paula  ');

    expect(oauthStateDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ displayName: 'Drive da Paula', connectionId: null })
    });
  });

  it('falls back to GOOGLE_DRIVE when the chosen name is blank', async () => {
    await service.createGoogleAuthorizationUrl(userId, '   ');

    expect(oauthStateDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ displayName: 'GOOGLE_DRIVE' })
    });
  });

  it('uses the name stored in the OAuth state when creating the connection', async () => {
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id', connectionId: null, displayName: 'Meu Drive' });
    googleOAuthClient.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiryDate: new Date('2026-05-24T14:00:00.000Z'),
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    providerIntegrationDelegate.create.mockResolvedValue({ ...persistedConnection, displayName: 'Meu Drive' });

    await service.completeGoogleConnection(userId, {
      code: 'google-code',
      state: 'state-value-with-enough-length-123456'
    });

    expect(providerIntegrationDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ displayName: 'Meu Drive' }),
      select: expect.any(Object)
    });
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
        displayName: 'GOOGLE_DRIVE',
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
      lastError: null,
      lastErrorAt: null,
      projects: [],
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
    expect(providerIntegrationDelegate.update).not.toHaveBeenCalled();
  });

  it('does not schedule drive indexing when the connection only has drive.file scope', async () => {
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id' });
    googleOAuthClient.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiryDate: null,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });
    providerIntegrationDelegate.create.mockResolvedValue(persistedConnection);

    await service.completeGoogleConnection(userId, { code: 'google-code', state: 'state-value-with-enough-length-1' });

    expect(driveIndexSyncService.requestRefresh).not.toHaveBeenCalled();
  });

  it('schedules a full drive indexing right after a new connection with drive.readonly scope', async () => {
    const readScopes = ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive.readonly'];
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id' });
    googleOAuthClient.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiryDate: null,
      scopes: readScopes
    });
    providerIntegrationDelegate.create.mockResolvedValue({ ...persistedConnection, scopes: readScopes });

    await service.completeGoogleConnection(userId, { code: 'google-code', state: 'state-value-with-enough-length-1' });

    expect(driveIndexSyncService.requestRefresh).toHaveBeenCalledWith(userId, persistedConnection.id, 'full');
  });

  it('schedules an incremental indexing on reauthorization and ignores scheduling failures', async () => {
    const readScopes = ['https://www.googleapis.com/auth/drive.readonly'];
    oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id', connectionId: persistedConnection.id });
    googleOAuthClient.exchangeCode.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: null,
      expiryDate: null,
      scopes: readScopes
    });
    providerIntegrationDelegate.update.mockResolvedValue({ ...persistedConnection, scopes: readScopes });
    driveIndexSyncService.requestRefresh.mockRejectedValue(new Error('db down'));

    const response = await service.completeGoogleConnection(userId, {
      code: 'google-code',
      state: 'state-value-with-enough-length-1'
    });

    expect(driveIndexSyncService.requestRefresh).toHaveBeenCalledWith(userId, persistedConnection.id, 'incremental');
    expect(response.id).toBe(persistedConnection.id);
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

  const storedCredentials = {
    id: persistedConnection.id,
    userId,
    provider: Provider.GOOGLE_DRIVE,
    status: ProviderIntegrationStatus.CONNECTED,
    providerAccountId: 'google-account-1',
    encryptedAccessToken: 'encrypted:access',
    encryptedRefreshToken: 'encrypted:refresh',
    tokenExpiresAt: null
  };

  it('revokes an owned connection at Google and wipes the stored tokens', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue(storedCredentials);
    providerIntegrationDelegate.update.mockResolvedValue({
      ...persistedConnection,
      status: ProviderIntegrationStatus.REVOKED
    });

    const response = await service.revokeConnection(userId, persistedConnection.id);

    expect(driveProvider.revokeAuthorization).toHaveBeenCalledWith(storedCredentials);
    expect(providerIntegrationDelegate.update).toHaveBeenCalledWith({
      where: { id: persistedConnection.id },
      data: {
        status: ProviderIntegrationStatus.REVOKED,
        revokedAt: expect.any(Date),
        encryptedAccessToken: '',
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      },
      select: expect.any(Object)
    });
    expect(response.status).toBe(ProviderIntegrationStatus.REVOKED);
  });

  it('does not revoke at Google when another active connection uses the same account', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue(storedCredentials);
    providerIntegrationDelegate.count.mockResolvedValue(1);
    providerIntegrationDelegate.update.mockResolvedValue({ ...persistedConnection, status: ProviderIntegrationStatus.REVOKED });

    await service.revokeConnection(userId, persistedConnection.id);

    expect(driveProvider.revokeAuthorization).not.toHaveBeenCalled();
  });

  describe('account identity', () => {
    const tokens = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiryDate: null,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    };
    const callback = { code: 'google-code', state: 'state-value-with-enough-length-123456' };

    beforeEach(() => {
      googleOAuthClient.exchangeCode.mockResolvedValue(tokens);
    });

    it('stores the Google account id and email on a new connection', async () => {
      oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id', connectionId: null, displayName: null });
      providerIntegrationDelegate.create.mockResolvedValue(persistedConnection);

      await service.completeGoogleConnection(userId, callback);

      expect(providerIntegrationDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ providerAccountId: 'google-account-1', providerAccountEmail: 'me@example.com' }),
        select: expect.any(Object)
      });
    });

    it('refuses to reauthorize a connection with a different Google account', async () => {
      oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id', connectionId: persistedConnection.id });
      providerIntegrationDelegate.findFirst.mockResolvedValueOnce({
        providerAccountId: 'google-account-original',
        providerAccountEmail: 'isaias@example.com'
      });

      await expect(service.completeGoogleConnection(userId, callback)).rejects.toBeInstanceOf(ConflictException);
      expect(providerIntegrationDelegate.update).not.toHaveBeenCalled();
      expect(oauthStateDelegate.update).toHaveBeenCalledWith({
        where: { id: 'oauth-state-id' },
        data: { consumedAt: expect.any(Date) }
      });
    });

    it('refuses to connect a Google account that is already connected', async () => {
      oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id', connectionId: null, displayName: null });
      providerIntegrationDelegate.findFirst.mockResolvedValueOnce({ displayName: 'Drive Isaias' });

      await expect(service.completeGoogleConnection(userId, callback)).rejects.toThrow('Drive Isaias');
      expect(providerIntegrationDelegate.create).not.toHaveBeenCalled();
    });

    it('accepts the first reauthorization of a legacy connection without a stored account', async () => {
      oauthStateDelegate.findFirst.mockResolvedValue({ id: 'oauth-state-id', connectionId: persistedConnection.id });
      providerIntegrationDelegate.findFirst
        .mockResolvedValueOnce({ providerAccountId: null, providerAccountEmail: null })
        .mockResolvedValueOnce(null);
      providerIntegrationDelegate.update.mockResolvedValue(persistedConnection);

      await service.completeGoogleConnection(userId, callback);

      expect(providerIntegrationDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerAccountId: 'google-account-1', lastError: null })
        })
      );
    });
  });

  describe('deleteConnection', () => {
    it('blocks deletion while buckets or files still depend on the connection', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue(storedCredentials);
      bucketCount.mockResolvedValue(1);
      objectCount.mockResolvedValue(211298);

      await expect(service.deleteConnection(userId, persistedConnection.id)).rejects.toBeInstanceOf(ConflictException);
      expect(providerIntegrationDelegate.delete).not.toHaveBeenCalled();
    });

    it('revokes and deletes an unused connection', async () => {
      providerIntegrationDelegate.findFirst.mockResolvedValue(storedCredentials);

      await service.deleteConnection(userId, persistedConnection.id);

      expect(driveProvider.revokeAuthorization).toHaveBeenCalled();
      expect(providerIntegrationDelegate.delete).toHaveBeenCalledWith({ where: { id: persistedConnection.id } });
    });
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
