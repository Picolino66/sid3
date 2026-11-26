import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StorageObjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectConnectionsService } from '../projects/project-connections.service';
import { BucketResponseDto } from './dto/bucket-response.dto';
import { CreateBucketRequestDto } from './dto/create-bucket-request.dto';
import { UpdateBucketRequestDto } from './dto/update-bucket-request.dto';

type PersistedBucket = {
  id: string;
  projectId: string;
  name: string;
  providerIntegrationId: string | null;
  storagePoolId: string | null;
  createdAt: Date;
  _count?: { storageObjects: number };
};

const LIVE_OBJECTS = { deletedAt: null, status: { not: StorageObjectStatus.DELETED } };

@Injectable()
export class BucketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectConnections: ProjectConnectionsService
  ) {}

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
    await this.assertDestination(projectId, request.providerIntegrationId, request.storagePoolId, true);

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

  async updateBucket(
    ownerUserId: string,
    projectId: string,
    bucketId: string,
    request: UpdateBucketRequestDto
  ): Promise<BucketResponseDto> {
    await this.ensureProjectOwner(ownerUserId, projectId);
    const bucket = await this.findProjectBucket(projectId, bucketId);
    const changesDestination = request.providerIntegrationId !== undefined || request.storagePoolId !== undefined;

    if (changesDestination) {
      await this.assertDestination(projectId, request.providerIntegrationId, request.storagePoolId, true);
    }

    const data: Prisma.BucketUncheckedUpdateInput = {};
    if (request.name !== undefined) data.name = request.name.trim();
    if (changesDestination) {
      const sameDestination =
        (request.providerIntegrationId ?? null) === bucket.providerIntegrationId &&
        (request.storagePoolId ?? null) === bucket.storagePoolId;
      data.providerIntegrationId = request.providerIntegrationId ?? null;
      data.storagePoolId = request.storagePoolId ?? null;
      // A pasta do bucket é resolvida de novo na conta de destino no próximo envio.
      if (!sameDestination) data.providerRootRef = null;
    }

    try {
      const updated = await this.prisma.bucket.update({ where: { id: bucket.id }, data, select: this.bucketSelect() });
      return this.toBucketResponse(updated);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um bucket com este nome neste projeto');
      }
      throw error;
    }
  }

  /** Só exclui buckets vazios: os arquivos e suas pastas no Drive nunca são apagados por aqui. */
  async deleteBucket(ownerUserId: string, projectId: string, bucketId: string): Promise<void> {
    await this.ensureProjectOwner(ownerUserId, projectId);
    const bucket = await this.findProjectBucket(projectId, bucketId);

    const liveObjects = await this.prisma.storageObject.count({ where: { bucketId: bucket.id, ...LIVE_OBJECTS } });
    if (liveObjects > 0) {
      throw new ConflictException(`O bucket ainda tem ${liveObjects} arquivo(s). Exclua os arquivos antes de excluir o bucket.`);
    }

    await this.prisma.storageObject.deleteMany({ where: { bucketId: bucket.id } });
    await this.prisma.bucket.delete({ where: { id: bucket.id } });
  }

  private async assertDestination(
    projectId: string,
    providerIntegrationId: string | undefined,
    storagePoolId: string | undefined,
    required: boolean
  ): Promise<void> {
    const hasIntegration = Boolean(providerIntegrationId);
    const hasPool = Boolean(storagePoolId);

    if (required && !hasIntegration && !hasPool) {
      throw new BadRequestException('É necessário informar providerIntegrationId ou storagePoolId');
    }

    if (hasIntegration && hasPool) {
      throw new BadRequestException('providerIntegrationId e storagePoolId são mutuamente exclusivos');
    }

    if (hasIntegration) {
      await this.projectConnections.assertUsableInProject(projectId, providerIntegrationId!);
    } else if (hasPool) {
      await this.ensureProjectPool(projectId, storagePoolId!);
    }
  }

  private async ensureProjectOwner(ownerUserId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerUserId },
      select: { id: true }
    });

    if (!project) {
      throw new NotFoundException('Projeto não encontrado para o usuário atual');
    }
  }

  private async findProjectBucket(projectId: string, bucketId: string) {
    const bucket = await this.prisma.bucket.findFirst({
      where: { id: bucketId, projectId },
      select: { id: true, providerIntegrationId: true, storagePoolId: true }
    });

    if (!bucket) {
      throw new NotFoundException('Bucket não encontrado');
    }

    return bucket;
  }

  private async ensureProjectPool(projectId: string, poolId: string): Promise<void> {
    const pool = await this.prisma.storagePool.findFirst({
      where: { id: poolId, projectId },
      select: { id: true, _count: { select: { members: true } } }
    });

    if (!pool) {
      throw new BadRequestException('Pool de armazenamento não encontrado neste projeto');
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
      objectCount: bucket._count?.storageObjects ?? 0,
      createdAt: bucket.createdAt.toISOString()
    };
  }

  private bucketSelect() {
    return {
      id: true,
      projectId: true,
      name: true,
      providerIntegrationId: true,
      storagePoolId: true,
      createdAt: true,
      _count: { select: { storageObjects: { where: LIVE_OBJECTS } } }
    } satisfies Prisma.BucketSelect;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
