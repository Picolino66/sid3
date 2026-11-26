import { Injectable } from '@nestjs/common';
import { OperationStatus, OperationType, ProviderIntegrationStatus, Sid3RootFolderStatus, StorageObjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectAlertDto, ProjectOverviewResponseDto } from './dto/project-overview-response.dto';
import { ProjectsService } from './projects.service';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resumo do projeto para a tela Início: totais, checklist de configuração e problemas que pedem ação. */
@Injectable()
export class ProjectOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService
  ) {}

  async getOverview(ownerUserId: string, projectId: string): Promise<ProjectOverviewResponseDto> {
    const project = await this.projectsService.findOwnedProject(ownerUserId, projectId);
    const since = new Date(Date.now() - DAY_MS);
    const liveObjects = { projectId, deletedAt: null, status: { not: StorageObjectStatus.DELETED } };

    const [links, buckets, objectAggregate, activeApiKeyCount, failedUploads24h, uploads24h, objectsByConnection] =
      await Promise.all([
        this.prisma.projectConnection.findMany({
          where: { projectId },
          select: {
            providerIntegration: {
              select: { id: true, displayName: true, status: true, lastError: true, sid3RootFolderStatus: true }
            }
          }
        }),
        this.prisma.bucket.findMany({
          where: { projectId },
          select: {
            id: true,
            name: true,
            providerIntegrationId: true,
            storagePoolId: true,
            providerIntegration: { select: { id: true, displayName: true, status: true } }
          }
        }),
        this.prisma.storageObject.aggregate({ where: liveObjects, _count: { _all: true }, _sum: { sizeBytes: true } }),
        this.prisma.apiKey.count({ where: { projectId, revokedAt: null } }),
        this.prisma.operationLog.count({
          where: { projectId, operation: OperationType.UPLOAD, status: OperationStatus.FAILED, createdAt: { gte: since } }
        }),
        this.prisma.operationLog.count({
          where: { projectId, operation: OperationType.UPLOAD, status: OperationStatus.SUCCESS, createdAt: { gte: since } }
        }),
        this.prisma.storageObject.groupBy({
          by: ['resolvedIntegrationId'],
          where: { ...liveObjects, status: StorageObjectStatus.AVAILABLE },
          _count: { _all: true }
        })
      ]);

    const linkedIds = new Set(links.map((link) => link.providerIntegration.id));
    const alerts: ProjectAlertDto[] = [];
    const alert = (entry: Omit<ProjectAlertDto, 'connectionId' | 'bucketId'> & Partial<ProjectAlertDto>) =>
      alerts.push({ connectionId: null, bucketId: null, ...entry });

    for (const { providerIntegration: connection } of links) {
      const name = connection.displayName ?? 'GOOGLE_DRIVE';
      if (connection.status === ProviderIntegrationStatus.REVOKED) {
        alert({ severity: 'critical', code: 'CONNECTION_REVOKED', connectionId: connection.id,
          message: `A conexão "${name}" está revogada. Reconecte-a em Conexões.` });
      } else if (connection.status === ProviderIntegrationStatus.ERROR) {
        alert({ severity: 'critical', code: connection.lastError ?? 'CONNECTION_ERROR', connectionId: connection.id,
          message: connection.lastError === 'ACCOUNT_MISMATCH'
            ? `A conexão "${name}" está com tokens de outra conta Google. Envios bloqueados; reconecte com a conta original.`
            : `O Google recusou a autorização da conexão "${name}". Reconecte-a em Conexões.` });
      }
      if (connection.sid3RootFolderStatus === Sid3RootFolderStatus.PENDING_CONFIRMATION) {
        alert({ severity: 'warning', code: 'SID3_FOLDER_PENDING', connectionId: connection.id,
          message: `A conexão "${name}" encontrou uma pasta "sid3" existente. Confirme em Conexões para liberar os envios.` });
      }
    }

    for (const bucket of buckets) {
      const connection = bucket.providerIntegration;
      if (!connection) continue;
      const name = connection.displayName ?? 'GOOGLE_DRIVE';
      if (connection.status !== ProviderIntegrationStatus.CONNECTED) {
        alert({ severity: 'critical', code: 'BUCKET_DESTINATION_INACTIVE', bucketId: bucket.id, connectionId: connection.id,
          message: `O bucket "${bucket.name}" não recebe arquivos: a conexão "${name}" não está ativa.` });
      }
      if (!linkedIds.has(connection.id)) {
        alert({ severity: 'warning', code: 'BUCKET_CONNECTION_NOT_LINKED', bucketId: bucket.id, connectionId: connection.id,
          message: `O bucket "${bucket.name}" usa a conexão "${name}", que não está adicionada a este projeto.` });
      }
    }

    const connectionStatus = await this.connectionStatuses(objectsByConnection.map((row) => row.resolvedIntegrationId));
    for (const row of objectsByConnection) {
      const status = row.resolvedIntegrationId ? connectionStatus.get(row.resolvedIntegrationId) : undefined;
      if (status && status.status !== ProviderIntegrationStatus.CONNECTED) {
        alert({ severity: 'critical', code: 'OBJECTS_UNREACHABLE', connectionId: row.resolvedIntegrationId,
          message: `${row._count._all} arquivo(s) estão guardados na conexão "${status.displayName ?? 'GOOGLE_DRIVE'}", que não está ativa. Reconecte-a para voltar a acessá-los.` });
      }
    }

    if (failedUploads24h > 0) {
      alert({ severity: 'warning', code: 'UPLOAD_FAILURES',
        message: `${failedUploads24h} envio(s) falharam nas últimas 24h. Veja os detalhes em Logs.` });
    }

    const objectCount = objectAggregate._count._all;
    return {
      projectId: project.id,
      projectName: project.name,
      totals: {
        objectCount,
        totalBytes: Number(objectAggregate._sum.sizeBytes ?? 0n),
        bucketCount: buckets.length,
        connectionCount: links.length,
        activeApiKeyCount,
        failedUploads24h,
        uploads24h
      },
      setup: {
        hasConnection: links.length > 0,
        hasBucket: buckets.length > 0,
        hasApiKey: activeApiKeyCount > 0,
        hasObject: objectCount > 0
      },
      alerts: alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    };
  }

  private async connectionStatuses(ids: (string | null)[]) {
    const connectionIds = ids.filter((id): id is string => Boolean(id));
    const rows = connectionIds.length
      ? await this.prisma.providerIntegration.findMany({
          where: { id: { in: connectionIds } },
          select: { id: true, status: true, displayName: true }
        })
      : [];
    return new Map(rows.map((row) => [row.id, row]));
  }
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const;
