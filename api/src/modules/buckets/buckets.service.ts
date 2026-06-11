import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BucketResponseDto } from './dto/bucket-response.dto';
import { CreateBucketRequestDto } from './dto/create-bucket-request.dto';

type PersistedBucket = {
  id: string;
  projectId: string;
  name: string;
  providerIntegrationId: string | null;
  storagePoolId: string | null;
  createdAt: Date;
};

@Injectable()
export class BucketsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBuckets(ownerUserId: string, projectId: string): Promise<BucketResponseDto[]> {
    await this.ensureProjectOwner(ownerUserId, projectId);
    return this.listBucketsByProject(projectId);
  }

  async listBucketsByProject(projectId: string): Promise<BucketResponseDto[]> {
    const buckets = await this.prisma.bucket.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: this.bucketSelect()
    });

    return buckets.map((bucket) => this.toBucketResponse(bucket));
  }

  async createBucket(
    ownerUserId: string,
    projectId: string,
    request: CreateBucketRequestDto
  ): Promise<BucketResponseDto> {
    await this.ensureProjectOwner(ownerUserId, projectId);

    const hasIntegration = Boolean(request.providerIntegrationId);
    const hasPool = Boolean(request.storagePoolId);

    if (!hasIntegration && !hasPool) {
      throw new BadRequestException('É necessário informar providerIntegrationId ou storagePoolId');
    }

    if (hasIntegration && hasPool) {
      throw new BadRequestException('providerIntegrationId e storagePoolId são mutuamente exclusivos');
    }

    if (hasIntegration) {
      await this.ensureConnectedIntegration(ownerUserId, request.providerIntegrationId!);
    } else {
      await this.ensureConnectedPool(ownerUserId, request.storagePoolId!);
    }

    try {
      const bucket = await this.prisma.bucket.create({
        data: {
          projectId,
          name: request.name.trim(),
          providerIntegrationId: request.providerIntegrationId ?? null,
          storagePoolId: request.storagePoolId ?? null
        },
        select: this.bucketSelect()
      });

      return this.toBucketResponse(bucket);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um bucket com este nome neste projeto');
      }
      throw error;
    }
  }

  private async ensureProjectOwner(ownerUserId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ownerUserId
      },
      select: { id: true }
    });

    if (!project) {
      throw new UnauthorizedException('Projeto não encontrado para o usuário atual');
    }
  }

  private async ensureConnectedIntegration(ownerUserId: string, providerIntegrationId: string): Promise<void> {
    const integration = await this.prisma.providerIntegration.findFirst({
      where: {
        id: providerIntegrationId,
        userId: ownerUserId
      },
      select: {
        id: true,
        status: true
      }
    });

    if (!integration) {
      throw new UnauthorizedException('Integração de provedor não encontrada para o usuário atual');
    }

    if (integration.status !== ProviderIntegrationStatus.CONNECTED) {
      throw new BadRequestException('A integração de provedor não está conectada');
    }
  }

  private async ensureConnectedPool(ownerUserId: string, poolId: string): Promise<void> {
    const pool = await this.prisma.storagePool.findFirst({
      where: {
        id: poolId,
        project: { ownerUserId }
      },
      select: {
        id: true,
        _count: { select: { members: true } }
      }
    });

    if (!pool) {
      throw new UnauthorizedException('Pool de armazenamento não encontrado para o usuário atual');
    }

    if (pool._count.members === 0) {
      throw new BadRequestException('O pool de armazenamento não possui membros');
    }
  }

  private toBucketResponse(bucket: PersistedBucket): BucketResponseDto {
    return {
      id: bucket.id,
      projectId: bucket.projectId,
      name: bucket.name,
      providerIntegrationId: bucket.providerIntegrationId ?? null,
      storagePoolId: bucket.storagePoolId ?? null,
      createdAt: bucket.createdAt.toISOString()
    };
  }

  private bucketSelect(): Prisma.BucketSelect {
    return {
      id: true,
      projectId: true,
      name: true,
      providerIntegrationId: true,
      storagePoolId: true,
      createdAt: true
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
