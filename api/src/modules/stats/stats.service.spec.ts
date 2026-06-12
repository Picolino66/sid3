import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Provider, ProviderIntegrationStatus, StorageObjectStatus } from '@prisma/client';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { PrismaService } from '../prisma/prisma.service';
import { StatsService } from './stats.service';

type ProjectDelegateMock = { findFirst: jest.Mock };
type StorageObjectDelegateMock = { groupBy: jest.Mock; aggregate: jest.Mock };
type BucketDelegateMock = { findMany: jest.Mock };
type ProviderIntegrationDelegateMock = { findMany: jest.Mock; findFirst: jest.Mock };

const mockQuota = {
  limitBytes: '16106127360',
  usageBytes: '2621440',
  usageInDriveBytes: '1048576'
};

const connTokenFields = {
  encryptedAccessToken: 'enc-access',
  encryptedRefreshToken: 'enc-refresh',
  tokenExpiresAt: null
};

describe(StatsService.name, () => {
  const userId = 'f57d5b3d-2e99-41f4-9276-0934f7e5a0af';
  const projectId = '11e87cb1-7a79-465c-bdc1-4dfe9128ca34';
  const connectionId = 'bea8b8bd-c2fc-4104-9a4e-b7a529d79d0d';

  let projectDelegate: ProjectDelegateMock;
  let storageObjectDelegate: StorageObjectDelegateMock;
  let bucketDelegate: BucketDelegateMock;
  let providerIntegrationDelegate: ProviderIntegrationDelegateMock;
  let driveProvider: jest.Mocked<Pick<GoogleDriveStorageProvider, 'getDriveQuota'>>;
  let service: StatsService;

  beforeEach(() => {
    projectDelegate = { findFirst: jest.fn().mockResolvedValue({ id: projectId }) };
    storageObjectDelegate = { groupBy: jest.fn(), aggregate: jest.fn() };
    bucketDelegate = { findMany: jest.fn() };
    providerIntegrationDelegate = { findMany: jest.fn(), findFirst: jest.fn() };
    driveProvider = { getDriveQuota: jest.fn().mockResolvedValue(mockQuota) };

    const prisma = {
      project: projectDelegate,
      storageObject: storageObjectDelegate,
      bucket: bucketDelegate,
      providerIntegration: providerIntegrationDelegate
    } as unknown as PrismaService;

    service = new StatsService(prisma, driveProvider as unknown as GoogleDriveStorageProvider);
  });

  it('returns project storage stats grouped by bucket and connection', async () => {
    storageObjectDelegate.groupBy
      .mockResolvedValueOnce([
        { bucketId: 'bucket-1', _sum: { sizeBytes: BigInt(15) }, _count: { id: 2 } }
      ])
      .mockResolvedValueOnce([
        { resolvedIntegrationId: connectionId, _sum: { sizeBytes: BigInt(10) }, _count: { id: 1 } }
      ]);
    bucketDelegate.findMany.mockResolvedValue([
      { id: 'bucket-1', name: 'avatars', providerIntegrationId: connectionId },
      { id: 'bucket-2', name: 'docs', providerIntegrationId: 'connection-unused' }
    ]);
    providerIntegrationDelegate.findMany.mockResolvedValue([
      {
        id: connectionId,
        provider: Provider.GOOGLE_DRIVE,
        displayName: 'Drive principal',
        providerAccountEmail: 'dev@example.com',
        status: ProviderIntegrationStatus.CONNECTED,
        ...connTokenFields
      }
    ]);

    const response = await service.getProjectStorageStats(userId, projectId);

    expect(projectDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, ownerUserId: userId },
      select: { id: true }
    });
    expect(storageObjectDelegate.groupBy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        by: ['bucketId'],
        where: {
          projectId,
          status: { notIn: [StorageObjectStatus.DELETED, StorageObjectStatus.FAILED] }
        }
      })
    );
    expect(driveProvider.getDriveQuota).toHaveBeenCalledWith(
      expect.objectContaining({ encryptedAccessToken: 'enc-access' })
    );
    expect(response).toEqual({
      totalSizeBytes: '15',
      totalObjectCount: 2,
      byBucket: [
        { bucketId: 'bucket-1', bucketName: 'avatars', sizeBytes: '15', objectCount: 2 }
      ],
      byConnection: [
        {
          connectionId,
          displayName: 'Drive principal',
          providerAccountEmail: 'dev@example.com',
          provider: Provider.GOOGLE_DRIVE,
          status: ProviderIntegrationStatus.CONNECTED,
          sizeBytes: '10',
          objectCount: 1,
          driveQuotaLimitBytes: mockQuota.limitBytes,
          driveQuotaUsageBytes: mockQuota.usageBytes,
          driveQuotaUsageInDriveBytes: mockQuota.usageInDriveBytes
        },
        {
          connectionId: 'connection-unused',
          displayName: null,
          providerAccountEmail: null,
          provider: Provider.GOOGLE_DRIVE,
          status: 'CONNECTED',
          sizeBytes: '0',
          objectCount: 0,
          driveQuotaLimitBytes: null,
          driveQuotaUsageBytes: null,
          driveQuotaUsageInDriveBytes: null
        }
      ]
    });
  });

  it('returns zeroed connection stats with direct bucket usage included', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue({
      id: connectionId,
      provider: Provider.GOOGLE_DRIVE,
      displayName: null,
      providerAccountEmail: null,
      status: ProviderIntegrationStatus.CONNECTED,
      ...connTokenFields
    });
    storageObjectDelegate.aggregate
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(12) }, _count: { id: 3 } })
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(8) }, _count: { id: 2 } });

    const response = await service.getConnectionStats(userId, connectionId);

    expect(response).toEqual({
      connectionId,
      displayName: null,
      providerAccountEmail: null,
      provider: Provider.GOOGLE_DRIVE,
      status: ProviderIntegrationStatus.CONNECTED,
      sizeBytes: '20',
      objectCount: 5,
      driveQuotaLimitBytes: mockQuota.limitBytes,
      driveQuotaUsageBytes: mockQuota.usageBytes,
      driveQuotaUsageInDriveBytes: mockQuota.usageInDriveBytes
    });
  });

  it('does not call getDriveQuota for revoked connections', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue({
      id: connectionId,
      provider: Provider.GOOGLE_DRIVE,
      displayName: null,
      providerAccountEmail: null,
      status: ProviderIntegrationStatus.REVOKED,
      ...connTokenFields
    });
    storageObjectDelegate.aggregate
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(0) }, _count: { id: 0 } })
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(0) }, _count: { id: 0 } });

    const response = await service.getConnectionStats(userId, connectionId);

    expect(driveProvider.getDriveQuota).not.toHaveBeenCalled();
    expect(response.driveQuotaLimitBytes).toBeNull();
    expect(response.driveQuotaUsageBytes).toBeNull();
  });

  it('lists connection stats for all user connections in project context', async () => {
    providerIntegrationDelegate.findMany.mockResolvedValue([
      { id: 'connection-1' },
      { id: 'connection-2' }
    ]);
    providerIntegrationDelegate.findFirst
      .mockResolvedValueOnce({
        id: 'connection-1',
        provider: Provider.GOOGLE_DRIVE,
        displayName: 'A',
        providerAccountEmail: null,
        status: ProviderIntegrationStatus.CONNECTED,
        ...connTokenFields
      })
      .mockResolvedValueOnce({
        id: 'connection-2',
        provider: Provider.GOOGLE_DRIVE,
        displayName: 'B',
        providerAccountEmail: 'b@example.com',
        status: ProviderIntegrationStatus.REVOKED,
        ...connTokenFields
      });
    storageObjectDelegate.aggregate
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(1) }, _count: { id: 1 } })
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(0) }, _count: { id: 0 } })
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(0) }, _count: { id: 0 } })
      .mockResolvedValueOnce({ _sum: { sizeBytes: BigInt(4) }, _count: { id: 2 } });

    const response = await service.getProjectConnectionsStats(userId, projectId);

    expect(providerIntegrationDelegate.findMany).toHaveBeenCalledWith({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: 'asc' }
    });
    expect(response).toHaveLength(2);
    expect(response[0]?.sizeBytes).toBe('1');
    expect(response[1]?.sizeBytes).toBe('4');
    expect(response[1]?.status).toBe(ProviderIntegrationStatus.REVOKED);
  });

  it('rejects storage stats when project is outside current user', async () => {
    projectDelegate.findFirst.mockResolvedValue(null);
    await expect(service.getProjectStorageStats(userId, projectId)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects connection stats when connection is not found', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue(null);
    await expect(service.getConnectionStats(userId, connectionId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
