import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import {
  OperationStatus,
  OperationType,
  Prisma,
  Provider,
  ProviderIntegrationStatus,
  Sid3RootFolderStatus,
  StorageObjectStatus
} from '@prisma/client';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { PoolRoutingFactory } from '../storage-pools/pool-routing/pool-routing.factory';
import { PoolMemberCredentials } from '../storage-pools/pool-routing/pool-routing.strategy';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { StorageProviderRegistry } from '../storage-providers/storage-provider.registry';
import { StorageProviderIntegrationCredentials } from '../storage-providers/dto/storage-provider.types';
import { ConnectionHealthService } from '../storage-providers/connection-health.service';
import { ObjectListResponseDto } from './dto/object-list-response.dto';
import { StorageObjectResponseDto } from './dto/storage-object-response.dto';
import { UploadObjectRequestDto } from './dto/upload-object-request.dto';
import { SignedDownloadUrlResponseDto } from './dto/signed-download-url-response.dto';
import { SignedUrlService } from './signed-url.service';

/** Quem está operando: uma chave de API (sistema externo) ou o dono do projeto logado no painel. */
export type ObjectAccessContext = {
  projectId: string;
  apiKeyId: string | null;
  userId?: string | null;
};

type ListObjectsQuery = {
  prefix?: string;
  limit?: string;
  cursor?: string;
  delimiter?: string;
};

type ListObjectsOptions = {
  /** Inclui URL assinada por item (usado pelo painel para miniaturas e reprodução). */
  includeDownloadUrls?: boolean;
  /** Prefixo público da API usado para montar as URLs assinadas. */
  downloadUrlBase?: string;
};

type PersistedObject = {
  id: string;
  projectId: string;
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
  id: string;
  status: ProviderIntegrationStatus;
  displayName: string | null;
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
  name: string;
  providerIntegrationId: string | null;
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
  private static readonly SID3_ROOT_FOLDER_NAME = 'sid3';
  private readonly logger = new Logger(ObjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProviderRegistry: StorageProviderRegistry,
    private readonly poolRoutingFactory: PoolRoutingFactory,
    @Optional() private signedUrlService?: SignedUrlService,
    @Optional() private readonly connectionHealth?: ConnectionHealthService
  ) {
    if (!this.signedUrlService) {
      this.signedUrlService = new SignedUrlService();
    }
  }

  async listObjects(
    access: ObjectAccessContext,
    bucketId: string,
    query: ListObjectsQuery,
    options: ListObjectsOptions = {}
  ): Promise<ObjectListResponseDto> {
    await this.getAuthorizedBucket(access.projectId, bucketId);
    const limit = this.parseLimit(query.limit);
    const prefix = query.prefix ?? '';

    if (query.delimiter !== undefined && query.delimiter !== '' && query.delimiter !== '/') {
      throw new BadRequestException('O único delimitador suportado é "/"');
    }

    const page = query.delimiter === '/'
      ? await this.listFolderLevel(access.projectId, bucketId, prefix, limit, query.cursor)
      : await this.listFlat(access.projectId, bucketId, prefix, limit, query.cursor);

    await this.logOperation(access, bucketId, null, OperationType.LIST, OperationStatus.SUCCESS);

    return {
      items: page.objects.map((object) => this.toStorageObjectResponse(object, options)),
      folders: page.folders,
      nextCursor: page.nextCursor
    };
  }

  /** Lista em ordem de envio (mais recentes primeiro) com cursor por (createdAt, id). */
  private async listFlat(projectId: string, bucketId: string, prefix: string, limit: number, cursor?: string) {
    const position = cursor ? this.decodeCursor<{ c: string; i: string }>(cursor) : null;
    const objects = await this.prisma.storageObject.findMany({
      where: {
        projectId,
        bucketId,
        deletedAt: null,
        ...(prefix ? { key: { startsWith: prefix } } : {}),
        ...(position
          ? {
              OR: [
                { createdAt: { lt: new Date(position.c) } },
                { createdAt: new Date(position.c), id: { lt: position.i } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: this.storageObjectSelect()
    });

    const hasMore = objects.length > limit;
    const pageItems = hasMore ? objects.slice(0, limit) : objects;
    const last = pageItems.at(-1);

    return {
      objects: pageItems,
      folders: [] as string[],
      nextCursor: hasMore && last ? this.encodeCursor({ c: last.createdAt.toISOString(), i: last.id }) : null
    };
  }

  /** Navegação por pastas: subpastas do prefixo + arquivos diretamente nele, em ordem alfabética de chave. */
  private async listFolderLevel(projectId: string, bucketId: string, prefix: string, limit: number, cursor?: string) {
    const afterKey = cursor ? this.decodeCursor<{ k: string }>(cursor).k : null;
    const prefixLength = prefix.length;

    const folders = afterKey
      ? []
      : (
          await this.prisma.$queryRaw<{ name: string }[]>(Prisma.sql`
            SELECT DISTINCT split_part(substring(key from ${prefixLength + 1}::int), '/', 1) AS name
            FROM storage_objects
            WHERE project_id = ${projectId}::uuid
              AND bucket_id = ${bucketId}::uuid
              AND deleted_at IS NULL
              AND left(key, ${prefixLength}::int) = ${prefix}
              AND strpos(substring(key from ${prefixLength + 1}::int), '/') > 0
            ORDER BY 1
            LIMIT 1000
          `)
        )
          .map((row) => row.name)
          .filter((name) => name !== '')
          .map((name) => `${prefix}${name}/`);

    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id
      FROM storage_objects
      WHERE project_id = ${projectId}::uuid
        AND bucket_id = ${bucketId}::uuid
        AND deleted_at IS NULL
        AND left(key, ${prefixLength}::int) = ${prefix}
        AND strpos(substring(key from ${prefixLength + 1}::int), '/') = 0
        ${afterKey !== null ? Prisma.sql`AND key > ${afterKey}` : Prisma.empty}
      ORDER BY key
      LIMIT ${limit + 1}::int
    `);

    const hasMore = rows.length > limit;
    const ids = (hasMore ? rows.slice(0, limit) : rows).map((row) => row.id);
    const objects = ids.length
      ? await this.prisma.storageObject.findMany({ where: { id: { in: ids } }, select: this.storageObjectSelect() })
      : [];
    objects.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const last = objects.at(-1);

    return {
      objects,
      folders,
      nextCursor: hasMore && last ? this.encodeCursor({ k: last.key }) : null
    };
  }

  private encodeCursor(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeCursor<T>(cursor: string): T {
    try {
      return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
    } catch {
      throw new BadRequestException('Cursor de paginação inválido');
    }
  }

  async uploadObject(
    apiKey: ObjectAccessContext,
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
    const parentFolderId = await this.withHealthReport(resolvedCredentials.integrationId, () =>
      this.resolveBucketFolderOnDrive(bucket, resolvedCredentials.integrationId, resolvedCredentials)
    );
    const checksumSha256 = await this.calculateChecksum(file);
    const storageObject = await this.createPendingObject(
      apiKey,
      bucketId,
      request,
      file,
      resolvedCredentials,
      resolvedCredentials.integrationId,
      checksumSha256
    );

    const provider = this.storageProviderRegistry.getProvider(resolvedCredentials.provider);

    try {
      const upload = await provider.uploadObject({
        integration: resolvedCredentials,
        fileName: file.originalname,
        contentType: file.mimetype,
        createReadStream: () => file.path
          ? createReadStream(file.path, { highWaterMark: 8 * 1024 * 1024 })
          : Readable.from(file.buffer),
        sizeBytes: file.size,
        parentFolderId
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
      const errorCode = this.extractErrorCode(error);
      await this.connectionHealth?.reportFailure(resolvedCredentials.integrationId, error);
      this.logger.error(
        `Upload failed for bucket=${bucketId} object=${storageObject.id} errorCode=${errorCode}`,
        error instanceof Error ? error.stack : String(error)
      );
      await this.prisma.storageObject.update({
        where: { id: storageObject.id },
        data: { status: StorageObjectStatus.FAILED },
        select: { id: true }
      });
      await this.logOperation(
        apiKey,
        bucketId,
        storageObject.id,
        OperationType.UPLOAD,
        OperationStatus.FAILED,
        resolvedCredentials.provider,
        errorCode
      );
      throw error;
    }
  }

  async downloadObject(
    apiKey: ObjectAccessContext,
    bucketId: string,
    objectId: string
  ): Promise<{ stream: Readable; fileName: string | null; contentType: string | null; sizeBytes: number | null }> {
    const bucket = await this.getAuthorizedBucket(apiKey.projectId, bucketId);
    const storageObject = await this.getAvailableObject(apiKey.projectId, bucketId, objectId);
    const credentials = await this.resolveIntegrationForAccess(storageObject.resolvedIntegrationId, bucket);
    const provider = this.storageProviderRegistry.getProvider(storageObject.provider);
    const download = await this.withHealthReport(credentials.integrationId, () =>
      provider.downloadObject({
        integration: credentials,
        providerFileId: storageObject.providerFileId
      })
    );

    await this.logOperation(apiKey, bucketId, objectId, OperationType.DOWNLOAD, OperationStatus.SUCCESS);
    return download;
  }

  async signDownloadUrl(
    apiKey: ObjectAccessContext,
    bucketId: string,
    objectId: string,
    expiresInSeconds?: number
  ): Promise<SignedDownloadUrlResponseDto> {
    await this.getAuthorizedBucket(apiKey.projectId, bucketId);
    await this.getAvailableObject(apiKey.projectId, bucketId, objectId);

    return this.signedUrlService!.generateSignedDownloadToken(
      bucketId,
      objectId,
      apiKey.projectId,
      expiresInSeconds
    );
  }

  async deleteObject(apiKey: ObjectAccessContext, bucketId: string, objectId: string): Promise<void> {
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
    try {
      await this.withHealthReport(credentials.integrationId, () =>
        provider.deleteObject({
          integration: credentials,
          providerFileId: storageObject.providerFileId
        })
      );
    } catch (error) {
      await this.prisma.storageObject.update({
        where: { id: objectId },
        data: { status: storageObject.status },
        select: { id: true }
      });
      throw error;
    }

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
        name: true,
        providerIntegrationId: true,
        storagePoolId: true,
        providerRootRef: true,
        providerIntegration: {
          select: this.integrationCredentialsSelect()
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
                  select: this.integrationCredentialsSelect()
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
      const { strategy } = bucket.storagePool;
      const members = bucket.storagePool.members.filter(
        (member) => member.providerIntegration.status === ProviderIntegrationStatus.CONNECTED
      );

      if (members.length === 0) {
        throw new ConflictException(
          'Nenhuma conexão do pool está ativa. Reconecte as contas do pool em Conexões antes de enviar arquivos.'
        );
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
    this.assertIntegrationActive(integration);

    return {
      integrationId: integration.id,
      provider: integration.provider,
      encryptedAccessToken: integration.encryptedAccessToken,
      encryptedRefreshToken: integration.encryptedRefreshToken,
      tokenExpiresAt: integration.tokenExpiresAt
    };
  }

  private async resolveIntegrationForAccess(
    resolvedIntegrationId: string | null,
    bucket: BucketWithIntegration
  ): Promise<StorageProviderIntegrationCredentials & { integrationId: string }> {
    const integration = resolvedIntegrationId
      ? await this.prisma.providerIntegration.findUniqueOrThrow({
          where: { id: resolvedIntegrationId },
          select: this.integrationCredentialsSelect()
        })
      : bucket.providerIntegration;

    if (!integration) {
      throw new BadRequestException('Não foi possível resolver a integração de armazenamento para este bucket');
    }

    this.assertIntegrationActive(integration);

    return {
      integrationId: integration.id,
      provider: integration.provider,
      encryptedAccessToken: integration.encryptedAccessToken,
      encryptedRefreshToken: integration.encryptedRefreshToken,
      tokenExpiresAt: integration.tokenExpiresAt
    };
  }

  private assertIntegrationActive(integration: BucketIntegrationCredentials): void {
    if (integration.status === ProviderIntegrationStatus.CONNECTED) {
      return;
    }

    const name = integration.displayName ?? 'GOOGLE_DRIVE';
    const state = integration.status === ProviderIntegrationStatus.REVOKED ? 'revogada' : 'com erro de autorização';
    throw new ConflictException(`A conexão "${name}" que guarda estes arquivos está ${state}. Reconecte-a em Conexões.`);
  }

  private integrationCredentialsSelect() {
    return {
      id: true,
      status: true,
      displayName: true,
      provider: true,
      encryptedAccessToken: true,
      encryptedRefreshToken: true,
      tokenExpiresAt: true
    } satisfies Prisma.ProviderIntegrationSelect;
  }

  /** Executa uma chamada ao Drive e, se o Google recusar a autorização, marca a conexão como ERROR. */
  private async withHealthReport<T>(integrationId: string | null, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      await this.connectionHealth?.reportFailure(integrationId, error);
      throw error;
    }
  }

  /**
   * Antes de recriar uma pasta que "sumiu", confirma que os tokens ainda são da mesma conta Google.
   * Se a conta mudou, para tudo em vez de criar pastas na conta errada.
   */
  private async assertSameGoogleAccount(
    integrationId: string,
    driveProvider: GoogleDriveStorageProvider,
    credentials: StorageProviderIntegrationCredentials
  ): Promise<void> {
    const stored = await this.prisma.providerIntegration.findUniqueOrThrow({
      where: { id: integrationId },
      select: { providerAccountId: true }
    });
    const identity = await driveProvider.getAccountIdentity(credentials);

    if (!stored?.providerAccountId) {
      await this.prisma.providerIntegration.updateMany({
        where: { id: integrationId, providerAccountId: null },
        data: { providerAccountId: identity.accountId, providerAccountEmail: identity.email }
      });
      return;
    }

    if (stored.providerAccountId !== identity.accountId) {
      await this.connectionHealth?.markError(integrationId, 'ACCOUNT_MISMATCH');
      throw new ConflictException(
        'Os tokens desta conexão pertencem a outra conta Google. Os envios foram bloqueados para não gravar na conta errada; reconecte com a conta original.'
      );
    }
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
    apiKey: ObjectAccessContext,
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
    apiKey: ObjectAccessContext,
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
          ownerUserId: apiKey.userId ?? (await this.getProjectOwnerId(apiKey.projectId)),
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
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
      throw new BadRequestException('O limite deve ser um inteiro entre 1 e 200');
    }

    return parsedLimit;
  }

  private toStorageObjectResponse(storageObject: PersistedObject, options: ListObjectsOptions = {}): StorageObjectResponseDto {
    const downloadUrl = options.includeDownloadUrls && storageObject.status === StorageObjectStatus.AVAILABLE
      ? this.buildSignedDownloadUrl(storageObject, options.downloadUrlBase ?? '')
      : undefined;

    return {
      ...(downloadUrl !== undefined ? { downloadUrl } : {}),
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

  private buildSignedDownloadUrl(storageObject: PersistedObject, base: string): string {
    const signed = this.signedUrlService!.generateSignedDownloadToken(
      storageObject.bucketId,
      storageObject.id,
      storageObject.projectId,
      3600
    );
    return `${base}/buckets/${storageObject.bucketId}/objects/${storageObject.id}/download?token=${encodeURIComponent(signed.token)}`;
  }

  private storageObjectSelect() {
    return {
      id: true,
      projectId: true,
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
    apiKey: ObjectAccessContext,
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
        userId: apiKey.userId ?? null,
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

  private async resolveBucketFolderOnDrive(
    bucket: BucketWithIntegration,
    resolvedIntegrationId: string,
    credentials: StorageProviderIntegrationCredentials
  ): Promise<string | undefined> {
    const driveProvider = this.storageProviderRegistry.getProvider(credentials.provider) as GoogleDriveStorageProvider;

    if (bucket.providerIntegrationId) {
      if (bucket.providerRootRef) {
        if (await driveProvider.isFolderUsable(bucket.providerRootRef, credentials)) {
          return bucket.providerRootRef;
        }

        await this.assertSameGoogleAccount(bucket.providerIntegrationId, driveProvider, credentials);
        this.logger.warn(`Bucket folder missing on Drive; recreating bucket=${bucket.id}`);
        await this.prisma.bucket.update({
          where: { id: bucket.id, providerRootRef: bucket.providerRootRef },
          data: { providerRootRef: null },
          select: { id: true }
        }).catch(() => undefined);
      }

      const folderId = await this.findOrCreateBucketFolder(
        driveProvider,
        bucket.providerIntegrationId,
        bucket.name,
        credentials
      );

      await this.prisma.bucket.update({
        where: { id: bucket.id, providerRootRef: null },
        data: { providerRootRef: folderId },
        select: { id: true }
      }).catch(() => undefined);

      return folderId;
    }

    const existing = await this.prisma.bucketFolderRef.findUnique({
      where: {
        bucketId_providerIntegrationId: {
          bucketId: bucket.id,
          providerIntegrationId: resolvedIntegrationId
        }
      },
      select: { folderId: true }
    });

    if (existing) {
      if (await driveProvider.isFolderUsable(existing.folderId, credentials)) {
        return existing.folderId;
      }

      await this.assertSameGoogleAccount(resolvedIntegrationId, driveProvider, credentials);

      await this.prisma.bucketFolderRef.deleteMany({
        where: {
          bucketId: bucket.id,
          providerIntegrationId: resolvedIntegrationId,
          folderId: existing.folderId
        }
      });
    }

    const folderId = await this.findOrCreateBucketFolder(
      driveProvider,
      resolvedIntegrationId,
      bucket.name,
      credentials
    );

    try {
      await this.prisma.bucketFolderRef.create({
        data: {
          bucketId: bucket.id,
          providerIntegrationId: resolvedIntegrationId,
          folderId
        },
        select: { id: true }
      });
    } catch (error) {
      if (this.isUniqueFolderRefError(error)) {
        const winner = await this.prisma.bucketFolderRef.findUniqueOrThrow({
          where: {
            bucketId_providerIntegrationId: {
              bucketId: bucket.id,
              providerIntegrationId: resolvedIntegrationId
            }
          },
          select: { folderId: true }
        });
        return winner.folderId;
      }
      throw error;
    }

    return folderId;
  }

  private async findOrCreateBucketFolder(
    driveProvider: GoogleDriveStorageProvider,
    integrationId: string,
    bucketName: string,
    credentials: StorageProviderIntegrationCredentials
  ): Promise<string> {
    const sid3RootFolderId = await this.resolveSid3RootFolder(integrationId, driveProvider, credentials);

    return driveProvider.findOrCreateFolder(bucketName, credentials, sid3RootFolderId);
  }

  /**
   * Resolves and caches the `sid3` root folder for a connection. A pasta encontrada que já
   * existia (não criada por nós) fica em PENDING_CONFIRMATION e bloqueia uploads até que o
   * usuário confirme ou recuse o uso dela em Conexões — ver ADR-0012.
   */
  private async resolveSid3RootFolder(
    integrationId: string,
    driveProvider: GoogleDriveStorageProvider,
    credentials: StorageProviderIntegrationCredentials
  ): Promise<string> {
    const integration = await this.prisma.providerIntegration.findUniqueOrThrow({
      where: { id: integrationId },
      select: { sid3RootFolderRef: true, sid3RootFolderStatus: true }
    });

    if (integration.sid3RootFolderStatus === Sid3RootFolderStatus.CONFIRMED && integration.sid3RootFolderRef) {
      if (await driveProvider.isFolderUsable(integration.sid3RootFolderRef, credentials)) {
        return integration.sid3RootFolderRef;
      }

      await this.assertSameGoogleAccount(integrationId, driveProvider, credentials);

      await this.prisma.providerIntegration.updateMany({
        where: { id: integrationId, sid3RootFolderRef: integration.sid3RootFolderRef },
        data: { sid3RootFolderRef: null, sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED }
      });

      return this.resolveSid3RootFolder(integrationId, driveProvider, credentials);
    }

    if (integration.sid3RootFolderStatus === Sid3RootFolderStatus.PENDING_CONFIRMATION) {
      throw new ConflictException(this.sid3RootConfirmationRequiredMessage());
    }

    const existingFolderId = await driveProvider.findFolderByName(ObjectsService.SID3_ROOT_FOLDER_NAME, credentials);

    if (existingFolderId) {
      const claimed = await this.prisma.providerIntegration.updateMany({
        where: { id: integrationId, sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED },
        data: {
          sid3RootFolderRef: existingFolderId,
          sid3RootFolderStatus: Sid3RootFolderStatus.PENDING_CONFIRMATION
        }
      });

      if (claimed.count === 0) {
        return this.resolveSid3RootFolder(integrationId, driveProvider, credentials);
      }

      throw new ConflictException(this.sid3RootConfirmationRequiredMessage());
    }

    const createdFolderId = await driveProvider.createFolder(ObjectsService.SID3_ROOT_FOLDER_NAME, credentials);

    const claimed = await this.prisma.providerIntegration.updateMany({
      where: { id: integrationId, sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED },
      data: {
        sid3RootFolderRef: createdFolderId,
        sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
      }
    });

    if (claimed.count === 0) {
      return this.resolveSid3RootFolder(integrationId, driveProvider, credentials);
    }

    return createdFolderId;
  }

  private sid3RootConfirmationRequiredMessage(): string {
    return 'Encontramos uma pasta "sid3" já existente nesta conta do Google Drive. Confirme ou recuse o uso dela em Conexões antes de enviar novos arquivos.';
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

  private isUniqueFolderRefError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes('bucket_id') &&
      error.meta.target.includes('provider_integration_id')
    );
  }

  private extractErrorCode(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined;
    const msg = error.message.toLowerCase();
    if (msg.includes('invalid_grant')) return 'INVALID_GRANT';
    if (msg.includes('quota')) return 'QUOTA_EXCEEDED';
    if (msg.includes('forbidden') || msg.includes('403')) return 'FORBIDDEN';
    if (msg.includes('not found') || msg.includes('404')) return 'NOT_FOUND';
    return 'PROVIDER_ERROR';
  }

  private async calculateChecksum(file: Express.Multer.File): Promise<string> {
    const hash = createHash('sha256');
    const stream = file.path ? createReadStream(file.path) : Readable.from(file.buffer);

    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
  }
}
