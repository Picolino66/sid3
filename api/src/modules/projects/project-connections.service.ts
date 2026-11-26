import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderIntegrationStatus, StorageObjectStatus } from '@prisma/client';
import { hasDriveFullReadScope } from '../drive-index/drive-index-scopes';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectConnectionResponseDto } from './dto/project-connection-response.dto';
import { ProjectsService } from './projects.service';

/**
 * Projetos e conexões vivem separados; aqui o usuário escolhe quais conexões ficam disponíveis em cada projeto.
 * A mesma conexão pode estar em N projetos. Buckets, pools e o Meu Drive do projeto só usam conexões vinculadas.
 */
@Injectable()
export class ProjectConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService
  ) {}

  async listProjectConnections(ownerUserId: string, projectId: string): Promise<ProjectConnectionResponseDto[]> {
    await this.projectsService.findOwnedProject(ownerUserId, projectId);

    const links = await this.prisma.projectConnection.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: this.linkSelect(projectId)
    });

    return links.map((link) => this.toResponse(link));
  }

  async linkConnection(ownerUserId: string, projectId: string, connectionId: string): Promise<ProjectConnectionResponseDto> {
    await this.projectsService.findOwnedProject(ownerUserId, projectId);

    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId: ownerUserId },
      select: { id: true, status: true }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    if (connection.status === ProviderIntegrationStatus.REVOKED) {
      throw new BadRequestException('Esta conexão está revogada. Reconecte-a em Conexões antes de usá-la num projeto.');
    }

    try {
      const link = await this.prisma.projectConnection.create({
        data: { projectId, providerIntegrationId: connectionId },
        select: this.linkSelect(projectId)
      });
      return this.toResponse(link);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Esta conexão já está neste projeto');
      }
      throw error;
    }
  }

  async unlinkConnection(ownerUserId: string, projectId: string, connectionId: string): Promise<void> {
    await this.projectsService.findOwnedProject(ownerUserId, projectId);

    const link = await this.prisma.projectConnection.findUnique({
      where: { projectId_providerIntegrationId: { projectId, providerIntegrationId: connectionId } },
      select: { id: true }
    });

    if (!link) {
      throw new NotFoundException('Esta conexão não está neste projeto');
    }

    const [bucketCount, poolCount, objectCount] = await Promise.all([
      this.prisma.bucket.count({ where: { projectId, providerIntegrationId: connectionId } }),
      this.prisma.storagePoolMember.count({ where: { providerIntegrationId: connectionId, pool: { projectId } } }),
      this.prisma.storageObject.count({
        where: {
          projectId,
          resolvedIntegrationId: connectionId,
          deletedAt: null,
          status: { not: StorageObjectStatus.DELETED }
        }
      })
    ]);

    if (bucketCount + poolCount + objectCount > 0) {
      throw new ConflictException(
        `A conexão está em uso neste projeto: ${bucketCount} bucket(s), ${poolCount} pool(s) e ${objectCount} arquivo(s) guardados nela.`
      );
    }

    await this.prisma.projectConnection.delete({ where: { id: link.id } });
  }

  /** Garante que a conexão está vinculada ao projeto e ativa (usado por buckets e pools). */
  async assertUsableInProject(projectId: string, connectionId: string): Promise<void> {
    const link = await this.prisma.projectConnection.findUnique({
      where: { projectId_providerIntegrationId: { projectId, providerIntegrationId: connectionId } },
      select: { providerIntegration: { select: { status: true } } }
    });

    if (!link) {
      throw new BadRequestException('Adicione esta conexão ao projeto (Armazenamento → Conexões do projeto) antes de usá-la.');
    }

    if (link.providerIntegration.status !== ProviderIntegrationStatus.CONNECTED) {
      throw new BadRequestException('A conexão não está ativa. Reconecte-a em Conexões.');
    }
  }

  private linkSelect(projectId: string) {
    return {
      createdAt: true,
      providerIntegration: {
        select: {
          id: true,
          displayName: true,
          providerAccountEmail: true,
          status: true,
          sid3RootFolderStatus: true,
          lastError: true,
          scopes: true,
          _count: { select: { buckets: { where: { projectId } } } }
        }
      }
    } satisfies Prisma.ProjectConnectionSelect;
  }

  private toResponse(link: {
    createdAt: Date;
    providerIntegration: {
      id: string;
      displayName: string | null;
      providerAccountEmail: string | null;
      status: ProviderIntegrationStatus;
      sid3RootFolderStatus: ProjectConnectionResponseDto['sid3RootFolderStatus'];
      lastError: string | null;
      scopes: string[];
      _count: { buckets: number };
    };
  }): ProjectConnectionResponseDto {
    const connection = link.providerIntegration;
    return {
      connectionId: connection.id,
      displayName: connection.displayName,
      providerAccountEmail: connection.providerAccountEmail,
      status: connection.status,
      sid3RootFolderStatus: connection.sid3RootFolderStatus,
      lastError: connection.lastError,
      canBrowseDrive: hasDriveFullReadScope(connection.scopes),
      bucketCount: connection._count.buckets,
      linkedAt: link.createdAt.toISOString()
    };
  }
}
