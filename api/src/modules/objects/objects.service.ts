import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationStatus, OperationType, Prisma, Provider, StorageObjectStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { ApiKeyAuthContext } from '../../common/auth/api-key-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PoolRoutingFactory } from '../storage-pools/pool-routing/pool-routing.factory';
import { PoolMemberCredentials } from '../storage-pools/pool-routing/pool-routing.strategy';
import { StorageProviderRegistry } from '../storage-providers/storage-provider.registry';
import { StorageProviderIntegrationCredentials } from '../storage-providers/dto/storage-provider.types';
import { ObjectListResponseDto } from './dto/object-list-response.dto';
import { StorageObjectResponseDto } from './dto/storage-object-response.dto';
import { UploadObjectRequestDto } from './dto/upload-object-request.dto';

type ListObjectsQuery = {
  prefix?: string;
  limit?: string;
};

type PersistedObject = {
  id: string;
  bucketId: string;
  key: string;
  fileName: string;
  contentType: string;
  sizeBytes: bigint;
  checksumSha256: string | null;
  status: StorageObjectStatus;
  createdAt: Date;
  updatedAt: Date;
};

type BucketIntegrationCredentials = {
  provider: Provider;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
};

type PoolMemberWithCredentials = {
  id: string;
  providerIntegrationId: string;
  weight: number;
  roundRobinIndex: number;
  providerIntegration: BucketIntegrationCredentials;
};

type BucketWithIntegration = {
  id: string;
  projectId: string;
  storagePoolId: string | null;
  providerRootRef: string | null;
  providerIntegration: BucketIntegrationCredentials | null;
  storagePool: {
    strategy: string;
    members: PoolMemberWithCredentials[];
  } | null;
};

@Injectable()
export class ObjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProviderRegistry: StorageProviderRegistry,
    private readonly poolRoutingFactory: PoolRoutingFactory
  ) {}

  async listObjects(
    apiKey: ApiKeyAuthContext,
    bucketId: string,
    query: ListObjectsQuery
  ): Promise<ObjectListResponseDto> {
    await this.getAuthorizedBucket(apiKey.projectId, bucketId);
    const limit = this.parseLimit(query.limit);

    const objects = await this.prisma.storageObject.findMany({
      where: {
        projectId: apiKey.projectId,
        bucketId,
        deletedAt: null,
        ...(query.prefix ? { key: { startsWith: query.prefix } } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: this.storageObjectSelect()
    });

    await this.logOperation(apiKey, bucketId, null, OperationType.LIST, OperationStatus.SUCCESS);

    return {
      items: objects.map((object) => this.toStorageObjectResponse(object)),
      nextCursor: null
    };
  }

  async uploadObject(
    apiKey: ApiKeyAuthContext,
    bucketId: string,
    request: UploadObjectRequestDto,
    file: Express.Multer.File | undefined
  ): Promise<StorageObjectResponseDto> {
    if (!file) {
      throw new BadRequestException('O arquivo é obrigatório');
    }

    const bucket = await this.getAuthorizedBucket(apiKey.projectId, bucketId);
    const resolvedCredentials = await this.resolveIntegrationForUpload(bucket);

    await this.ensureObjectKeyAvailable(apiKey, bucketId, request.key, resolvedCredentials.provider);
    const checksumSha256 = createHash('sha256').update(file.buffer).digest('hex');
    const storageObject = await this.createPendingObject(
      apiKey,
      bucketId,
      request,
      file,
      resolvedCredentials,
      bucket.storagePoolId ? resolvedCredentials.integrationId : null,
      checksumSha256
    );

    const provider = this.storageProviderRegistry.getProvider(resolvedCredentials.provider);

    try {
      const upload = await provider.uploadObject({
        integration: resolvedCredentials,
        fileName: file.originalname,
        contentType: file.mimetype,
        content: file.buffer,
        parentFolderId: bucket.providerRootRef
      });

      const updated = await this.prisma.storageObject.update({
        where: { id: storageObject.id },
        data: {
          providerFileId: upload.providerFileId,
          fileName: upload.fileName,
          contentType: upload.contentType,
          sizeBytes: BigInt(upload.sizeBytes),
          status: StorageObjectStatus.AVAILABLE
        },
        select: this.storageObjectSelect()
      });
      await this.logOperation(apiKey, bucketId, storageObject.id, OperationType.UPLOAD, OperationStatus.SUCCESS);
      return this.toStorageObjectResponse(updated);
    } catch (error) {
      await this.prisma.storageObject.update({
        where: { id: storageObject.id },
        data: { status: StorageObjectStatus.FAILED },
        select: { id: true }
      });
      await this.logOperation(apiKey, bucketId, storageObject.id, OperationType.UPLOAD, OperationStatus.FAILED);
      throw error;
    }
  }

  async downloadObject(
    apiKey: ApiKeyAuthContext,
    bucketId: string,
    objectId: string
  ): Promise<{ stream: Readable; fileName: string | null; contentType: string | null; sizeBytes: number | null }> {
    const bucket = await this.getAuthorizedBucket(apiKey.projectId, bucketId);
    const storageObject = await this.getAvailableObject(apiKey.projectId, bucketId, objectId);
    const credentials = await this.resolveIntegrationForAccess(storageObject.resolvedIntegrationId, bucket);
    const provider = this.storageProviderRegistry.getProvider(storageObject.provider);
    const download = await provider.downloadObject({
      integration: credentials,
      providerFileId: storageObject.providerFileId
    });

    await this.logOperation(apiKey, bucketId, objectId, OperationType.DOWNLOAD, OperationStatus.SUCCESS);
    return download;
  }

  async deleteObject(apiKey: ApiKeyAuthContext, bucketId: string, objectId: string): Promise<void> {
    const bucket = await this.getAuthorizedBucket(apiKey.projectId, bucketId);
    const storageObject = await this.getObjectForDelete(apiKey.projectId, bucketId, objectId);

    if (storageObject.status === StorageObjectStatus.DELETED) {
      return;
    }

    await this.prisma.storageObject.update({
      where: { id: objectId },
      data: { status: StorageObjectStatus.DELETING },
      select: { id: true }
    });

    const credentials = await this.resolveIntegrationForAccess(storageObject.resolvedIntegrationId, bucket);
    const provider = this.storageProviderRegistry.getProvider(storageObject.provider);
    await provider.deleteObject({
      integration: credentials,
      providerFileId: storageObject.providerFileId
    });

    await this.prisma.storageObject.update({
      where: { id: objectId },
      data: {
        status: StorageObjectStatus.DELETED,
        deletedAt: new Date()
      },
      select: { id: true }
    });
    await this.logOperation(apiKey, bucketId, objectId, OperationType.DELETE, OperationStatus.SUCCESS);
  }

  private async getAuthorizedBucket(projectId: string, bucketId: string): Promise<BucketWithIntegration> {
    const bucket = await this.prisma.bucket.findFirst({
      where: {
        id: bucketId,
        projectId
      },
      select: {
        id: true,
        projectId: true,
        storagePoolId: true,
        providerRootRef: true,
        providerIntegration: {
          select: {
            provider: true,
            encryptedAccessToken: true,
            encryptedRefreshToken: true,
            tokenExpiresAt: true
          }
        },
        storagePool: {
          select: {
            strategy: true,
            members: {
              select: {
                id: true,
                providerIntegrationId: true,
                weight: true,
                roundRobinIndex: true,
                providerIntegration: {
                  select: {
                    provider: true,
                    encryptedAccessToken: true,
                    encryptedRefreshToken: true,
                    tokenExpiresAt: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!bucket) {
      throw new NotFoundException('Bucket não encontrado');
    }

    return bucket;
  }

  private async resolveIntegrationForUpload(
    bucket: BucketWithIntegration
  ): Promise<StorageProviderIntegrationCredentials & { integrationId: string }> {
    if (bucket.storagePool) {
      const { members, strategy } = bucket.storagePool;

      if (members.length === 0) {
        throw new BadRequestException('O pool de armazenamento não possui membros ativos');
      }

      const memberCredentials: PoolMemberCredentials[] = members.map((m) => ({
        memberId: m.id,
        providerIntegrationId: m.providerIntegrationId,
        encryptedAccessToken: m.providerIntegration.encryptedAccessToken,
        encryptedRefreshToken: m.providerIntegration.encryptedRefreshToken,
        tokenExpiresAt: m.providerIntegration.tokenExpiresAt,
        weight: m.weight,
        roundRobinIndex: m.roundRobinIndex
      }));

      const selected = await this.poolRoutingFactory
        .getStrategy(strategy as Parameters<typeof this.poolRoutingFactory.getStrategy>[0])
        .selectMember(memberCredentials, this.prisma);

      const memberDetails = members.find((m) => m.id === selected.memberId)!;

      return {
        integrationId: selected.providerIntegrationId,
        provider: memberDetails.providerIntegration.provider,
        encryptedAccessToken: selected.encryptedAccessToken,
        encryptedRefreshToken: selected.encryptedRefreshToken,
        tokenExpiresAt: selected.tokenExpiresAt
      };
    }

    if (!bucket.providerIntegration) {
      throw new BadRequestException('O bucket não possui integração ou pool de armazenamento associado');
    }

    const integration = bucket.providerIntegration;

    return {
      integrationId: '',
      provider: integration.provider,
      encryptedAccessToken: integration.encryptedAccessToken,
      encryptedRefreshToken: integration.encryptedRefreshToken,
      tokenExpiresAt: integration.tokenExpiresAt
    };
  }

  private async resolveIntegrationForAccess(
    resolvedIntegrationId: string | null,
    bucket: BucketWithIntegration
  ): Promise<StorageProviderIntegrationCredentials> {
    if (resolvedIntegrationId) {
      const integration = await this.prisma.providerIntegration.findUniqueOrThrow({
        where: { id: resolvedIntegrationId },
        select: {
          provider: true,
          encryptedAccessToken: true,
          encryptedRefreshToken: true,
          tokenExpiresAt: true
        }
      });

      return integration;
    }

    if (!bucket.providerIntegration) {
      throw new BadRequestException('Não foi possível resolver a integração de armazenamento para este bucket');
    }

    return bucket.providerIntegration;
  }

  private async getProjectOwnerId(projectId: string): Promise<string> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerUserId: true }
    });

    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    return project.ownerUserId;
  }

  private async ensureObjectKeyAvailable(
    apiKey: ApiKeyAuthContext,
    bucketId: string,
    key: string,
    provider: Provider
  ): Promise<void> {
    const existingObject = await this.prisma.storageObject.findFirst({
      where: {
        projectId: apiKey.projectId,
        bucketId,
        key,
        deletedAt: null,
        status: { not: StorageObjectStatus.DELETED }
      },
      select: { id: true }
    });

    if (existingObject) {
      await this.logOperation(
        apiKey,
        bucketId,
        null,
        OperationType.UPLOAD,
        OperationStatus.FAILED,
        provider,
        'OBJECT_KEY_ALREADY_EXISTS'
      );
      throw new ConflictException('A chave de objeto já existe neste bucket');
    }
  }

  private async createPendingObject(
    apiKey: ApiKeyAuthContext,
    bucketId: string,
    request: UploadObjectRequestDto,
    file: Express.Multer.File,
    credentials: StorageProviderIntegrationCredentials,
    resolvedIntegrationId: string | null,
    checksumSha256: string
  ): Promise<{ id: string }> {
    try {
      return await this.prisma.storageObject.create({
        data: {
          projectId: apiKey.projectId,
          bucketId,
          ownerUserId: await this.getProjectOwnerId(apiKey.projectId),
          resolvedIntegrationId,
          key: request.key,
          provider: credentials.provider,
          fileName: file.originalname,
          contentType: file.mimetype,
          sizeBytes: BigInt(file.size),
          checksumSha256,
          status: StorageObjectStatus.PENDING
        },
        select: {
          id: true
        }
      });
    } catch (error) {
      if (this.isUniqueObjectKeyError(error)) {
        await this.logOperation(
          apiKey,
          bucketId,
          null,
          OperationType.UPLOAD,
          OperationStatus.FAILED,
          credentials.provider,
          'OBJECT_KEY_ALREADY_EXISTS'
        );
        throw new ConflictException('A chave de objeto já existe neste bucket');
      }

      throw error;
    }
  }

  private async getAvailableObject(projectId: string, bucketId: string, objectId: string) {
    const storageObject = await this.prisma.storageObject.findFirst({
      where: {
        id: objectId,
        projectId,
        bucketId,
        deletedAt: null,
        status: StorageObjectStatus.AVAILABLE
      },
      select: {
        provider: true,
        providerFileId: true,
        resolvedIntegrationId: true
      }
    });

    if (!storageObject?.providerFileId) {
      throw new NotFoundException('Objeto não encontrado');
    }

    return {
      provider: storageObject.provider,
      providerFileId: storageObject.providerFileId,
      resolvedIntegrationId: storageObject.resolvedIntegrationId
    };
  }

  private async getObjectForDelete(projectId: string, bucketId: string, objectId: string) {
    const storageObject = await this.prisma.storageObject.findFirst({
      where: {
        id: objectId,
        projectId,
        bucketId
      },
      select: {
        provider: true,
        providerFileId: true,
        resolvedIntegrationId: true,
        status: true
      }
    });

    if (!storageObject?.providerFileId) {
      throw new NotFoundException('Objeto não encontrado');
    }

    return {
      provider: storageObject.provider,
      providerFileId: storageObject.providerFileId,
      resolvedIntegrationId: storageObject.resolvedIntegrationId,
      status: storageObject.status
    };
  }

  private parseLimit(limit: string | undefined): number {
    if (!limit) {
      return 50;
    }

    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('O limite deve ser um inteiro entre 1 e 100');
    }

    return parsedLimit;
  }

  private toStorageObjectResponse(storageObject: PersistedObject): StorageObjectResponseDto {
    return {
      id: storageObject.id,
      bucketId: storageObject.bucketId,
      key: storageObject.key,
      fileName: storageObject.fileName,
      contentType: storageObject.contentType,
      sizeBytes: Number(storageObject.sizeBytes),
      checksumSha256: storageObject.checksumSha256,
      status: storageObject.status,
      createdAt: storageObject.createdAt.toISOString(),
      updatedAt: storageObject.updatedAt.toISOString()
    };
  }

  private storageObjectSelect() {
    return {
      id: true,
      bucketId: true,
      key: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      checksumSha256: true,
      status: true,
      createdAt: true,
      updatedAt: true
    };
  }

  private async logOperation(
    apiKey: ApiKeyAuthContext,
    bucketId: string,
    objectId: string | null,
    operation: OperationType,
    status: OperationStatus,
    provider?: Provider,
    errorCode?: string
  ): Promise<void> {
    await this.prisma.operationLog.create({
      data: {
        projectId: apiKey.projectId,
        apiKeyId: apiKey.apiKeyId,
        bucketId,
        objectId,
        operation,
        status,
        provider,
        errorCode,
        requestId: crypto.randomUUID()
      },
      select: { id: true }
    });
  }

  private isUniqueObjectKeyError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('bucket_id') &&
      error.meta.target.includes('key')
    );
  }
}
