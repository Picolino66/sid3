import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { StorageObjectStatus } from '@prisma/client';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionStatsResponseDto } from './dto/connection-stats-response.dto';
import { ProjectStorageStatsResponseDto } from './dto/project-storage-stats-response.dto';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly driveProvider: GoogleDriveStorageProvider
  ) {}

  async getProjectStorageStats(userId: string, projectId: string): Promise<ProjectStorageStatsResponseDto> {
    await this.ensureProjectOwner(userId, projectId);

    const [byBucketRaw, byResolvedIntegrationRaw, buckets, connections] = await Promise.all([
      this.prisma.storageObject.groupBy({
        by: ['bucketId'],
        where: { projectId, status: { notIn: [StorageObjectStatus.DELETED, StorageObjectStatus.FAILED] } },
        _sum: { sizeBytes: true },
        _count: { id: true }
      }),
      this.prisma.storageObject.groupBy({
        by: ['resolvedIntegrationId'],
        where: {
          projectId,
          resolvedIntegrationId: { not: null },
          status: { notIn: [StorageObjectStatus.DELETED, StorageObjectStatus.FAILED] }
        },
        _sum: { sizeBytes: true },
        _count: { id: true }
      }),
      this.prisma.bucket.findMany({
        where: { projectId },
        select: { id: true, name: true, providerIntegrationId: true }
      }),
      this.prisma.providerIntegration.findMany({
        where: { userId },
        select: {
          id: true,
          provider: true,
          displayName: true,
          providerAccountEmail: true,
          status: true,
          encryptedAccessToken: true,
          encryptedRefreshToken: true,
          tokenExpiresAt: true
        }
      })
    ]);

    const bucketMap = new Map(buckets.map((b) => [b.id, b]));
    const connectionMap = new Map(connections.map((c) => [c.id, c]));

    const byBucket = byBucketRaw.map((row) => ({
      bucketId: row.bucketId,
      bucketName: bucketMap.get(row.bucketId)?.name ?? 'Unknown',
      sizeBytes: String(row._sum.sizeBytes ?? BigInt(0)),
      objectCount: row._count.id
    }));

    const connectionUsage = new Map<string, { sizeBytes: bigint; objectCount: number }>();

    for (const row of byResolvedIntegrationRaw) {
      if (row.resolvedIntegrationId) {
        connectionUsage.set(row.resolvedIntegrationId, {
          sizeBytes: row._sum.sizeBytes ?? BigInt(0),
          objectCount: row._count.id
        });
      }
    }

    for (const bucket of buckets) {
      if (bucket.providerIntegrationId) {
        const usage = connectionUsage.get(bucket.providerIntegrationId) ?? { sizeBytes: BigInt(0), objectCount: 0 };
        connectionUsage.set(bucket.providerIntegrationId, usage);
      }
    }

    const quotaResults = await Promise.allSettled(
      [...connectionUsage.keys()].map(async (connectionId) => {
        const conn = connectionMap.get(connectionId);
        if (!conn || conn.status !== 'CONNECTED') {
          return { connectionId, quota: null };
        }
        const quota = await this.driveProvider.getDriveQuota({
          provider: conn.provider,
          encryptedAccessToken: conn.encryptedAccessToken,
          encryptedRefreshToken: conn.encryptedRefreshToken,
          tokenExpiresAt: conn.tokenExpiresAt
        });
        return { connectionId, quota };
      })
    );

    const quotaMap = new Map<string, { limitBytes: string | null; usageBytes: string; usageInDriveBytes: string } | null>();
    for (const result of quotaResults) {
      if (result.status === 'fulfilled') {
        quotaMap.set(result.value.connectionId, result.value.quota);
      }
    }

    const byConnection = [...connectionUsage.entries()].map(([connectionId, usage]) => {
      const conn = connectionMap.get(connectionId);
      const quota = quotaMap.get(connectionId) ?? null;
      return {
        connectionId,
        displayName: conn?.displayName ?? null,
        providerAccountEmail: conn?.providerAccountEmail ?? null,
        provider: (conn?.provider ?? 'GOOGLE_DRIVE') as ConnectionStatsResponseDto['provider'],
        status: (conn?.status ?? 'CONNECTED') as ConnectionStatsResponseDto['status'],
        sizeBytes: String(usage.sizeBytes),
        objectCount: usage.objectCount,
        driveQuotaLimitBytes: quota?.limitBytes ?? null,
        driveQuotaUsageBytes: quota?.usageBytes ?? null,
        driveQuotaUsageInDriveBytes: quota?.usageInDriveBytes ?? null
      };
    });

    const totalSizeBytes = byBucket.reduce((sum, b) => sum + BigInt(b.sizeBytes), BigInt(0));
    const totalObjectCount = byBucket.reduce((sum, b) => sum + b.objectCount, 0);

    return {
      totalSizeBytes: String(totalSizeBytes),
      totalObjectCount,
      byConnection,
      byBucket
    };
  }

  async getConnectionStats(userId: string, connectionId: string): Promise<ConnectionStatsResponseDto> {
    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: {
        id: true,
        provider: true,
        displayName: true,
        providerAccountEmail: true,
        status: true,
        encryptedAccessToken: true,
        encryptedRefreshToken: true,
        tokenExpiresAt: true
      }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    const [byResolved, byDirectBuckets] = await Promise.all([
      this.prisma.storageObject.aggregate({
        where: {
          resolvedIntegrationId: connectionId,
          status: { notIn: [StorageObjectStatus.DELETED, StorageObjectStatus.FAILED] }
        },
        _sum: { sizeBytes: true },
        _count: { id: true }
      }),
      this.prisma.storageObject.aggregate({
        where: {
          bucket: { providerIntegrationId: connectionId },
          resolvedIntegrationId: null,
          status: { notIn: [StorageObjectStatus.DELETED, StorageObjectStatus.FAILED] }
        },
        _sum: { sizeBytes: true },
        _count: { id: true }
      })
    ]);

    const totalBytes =
      (byResolved._sum.sizeBytes ?? BigInt(0)) + (byDirectBuckets._sum.sizeBytes ?? BigInt(0));
    const totalCount = byResolved._count.id + byDirectBuckets._count.id;

    let quota: { limitBytes: string | null; usageBytes: string; usageInDriveBytes: string } | null = null;
    if (connection.status === 'CONNECTED') {
      quota = await this.driveProvider.getDriveQuota({
        provider: connection.provider,
        encryptedAccessToken: connection.encryptedAccessToken,
        encryptedRefreshToken: connection.encryptedRefreshToken,
        tokenExpiresAt: connection.tokenExpiresAt
      }).catch(() => null);
    }

    return {
      connectionId: connection.id,
      displayName: connection.displayName,
      providerAccountEmail: connection.providerAccountEmail,
      provider: connection.provider,
      status: connection.status,
      sizeBytes: String(totalBytes),
      objectCount: totalCount,
      driveQuotaLimitBytes: quota?.limitBytes ?? null,
      driveQuotaUsageBytes: quota?.usageBytes ?? null,
      driveQuotaUsageInDriveBytes: quota?.usageInDriveBytes ?? null
    };
  }

  async getProjectConnectionsStats(
    userId: string,
    projectId: string
  ): Promise<ConnectionStatsResponseDto[]> {
    await this.ensureProjectOwner(userId, projectId);

    const connections = await this.prisma.providerIntegration.findMany({
      where: { userId },
      select: { id: true },
      orderBy: { createdAt: 'asc' }
    });

    return Promise.all(
      connections.map((c) => this.getConnectionStats(userId, c.id))
    );
  }

  private async ensureProjectOwner(userId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerUserId: userId },
      select: { id: true }
    });

    if (!project) {
      throw new UnauthorizedException('Projeto não encontrado para o usuário atual');
    }
  }
}
