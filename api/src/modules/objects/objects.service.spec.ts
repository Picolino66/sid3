import { BadGatewayException, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OperationStatus, OperationType, Prisma, Provider, Sid3RootFolderStatus, StorageObjectStatus } from '@prisma/client';
import { Readable } from 'stream';
import { ApiKeyAuthContext } from '../../common/auth/api-key-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { PoolRoutingFactory } from '../storage-pools/pool-routing/pool-routing.factory';
import { StorageProviderRegistry } from '../storage-providers/storage-provider.registry';
import { ObjectsService } from './objects.service';

const createdAt = new Date('2026-05-24T14:20:00.000Z');

describe(ObjectsService.name, () => {
  const apiKey: ApiKeyAuthContext = {
    apiKeyId: 'api-key-id',
    projectId: 'project-id'
  };
  const bucketId = 'bucket-id';
  const integrationId = 'integration-id';
  const bucket = {
    id: bucketId,
    projectId: apiKey.projectId,
    name: 'fotos',
    providerIntegrationId: integrationId,
    storagePoolId: null,
    providerRootRef: null,
    providerIntegration: {
      provider: Provider.GOOGLE_DRIVE,
      encryptedAccessToken: 'encrypted-access',
      encryptedRefreshToken: 'encrypted-refresh',
      tokenExpiresAt: null
    },
    storagePool: null
  };

  let prisma: {
    bucket: { findFirst: jest.Mock; update: jest.Mock };
    bucketFolderRef: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock; deleteMany: jest.Mock };
    providerIntegration: { findUniqueOrThrow: jest.Mock; updateMany: jest.Mock };
    project: { findUnique: jest.Mock };
    storageObject: { create: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    operationLog: { create: jest.Mock };
  };
  let provider: {
    uploadObject: jest.Mock;
    downloadObject: jest.Mock;
    deleteObject: jest.Mock;
    findOrCreateFolder: jest.Mock;
    findFolderByName: jest.Mock;
    createFolder: jest.Mock;
    isFolderUsable: jest.Mock;
  };
  let service: ObjectsService;

  beforeEach(() => {
    prisma = {
      bucket: {
        findFirst: jest.fn().mockResolvedValue(bucket),
        update: jest.fn().mockResolvedValue({ id: bucketId })
      },
      bucketFolderRef: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'ref-id' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      providerIntegration: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          sid3RootFolderRef: null,
          sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      project: { findUnique: jest.fn().mockResolvedValue({ ownerUserId: 'owner-id' }) },
      storageObject: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn()
      },
      operationLog: { create: jest.fn().mockResolvedValue({ id: 'log-id' }) }
    };
    provider = {
      uploadObject: jest.fn(),
      downloadObject: jest.fn(),
      deleteObject: jest.fn(),
      findOrCreateFolder: jest.fn().mockResolvedValue('drive-folder-id'),
      findFolderByName: jest.fn().mockResolvedValue(null),
      createFolder: jest.fn().mockResolvedValue('sid3-root-folder-id'),
      isFolderUsable: jest.fn().mockResolvedValue(true)
    };
    const registry = {
      getProvider: jest.fn().mockReturnValue(provider)
    } as unknown as StorageProviderRegistry;
    const poolRoutingFactory = {
      getStrategy: jest.fn().mockReturnValue({ selectMember: jest.fn() })
    } as unknown as PoolRoutingFactory;
    service = new ObjectsService(prisma as unknown as PrismaService, registry, poolRoutingFactory);
  });

  it('lists objects for an API key project and logs the operation', async () => {
    prisma.storageObject.findMany.mockResolvedValue([
      persistedObject({
        id: 'object-id',
        key: 'avatars/user.png'
      })
    ]);

    const response = await service.listObjects(apiKey, bucketId, {
      prefix: 'avatars/',
      limit: '10'
    });

    expect(prisma.bucket.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: bucketId, projectId: apiKey.projectId }
    }));
    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.key).toBe('avatars/user.png');
    expect(prisma.operationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operation: OperationType.LIST,
        status: OperationStatus.SUCCESS
      })
    }));
  });

  it('uploads a file, marks metadata available, and returns object metadata', async () => {
    prisma.storageObject.create.mockResolvedValue({ id: 'object-id' });
    provider.uploadObject.mockResolvedValue({
      providerFileId: 'google-file-id',
      fileName: 'user.png',
      contentType: 'image/png',
      sizeBytes: 4
    });
    prisma.storageObject.update.mockResolvedValue(
      persistedObject({
        id: 'object-id',
        key: 'avatars/user.png',
        providerFileId: 'google-file-id'
      })
    );

    const response = await service.uploadObject(
      apiKey,
      bucketId,
      { key: 'avatars/user.png' },
      {
        originalname: 'user.png',
        mimetype: 'image/png',
        size: 4,
        buffer: Buffer.from('file')
      } as Express.Multer.File
    );

    expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'user.png',
      contentType: 'image/png',
      createReadStream: expect.any(Function),
      sizeBytes: 4
    }));
    expect(response.status).toBe(StorageObjectStatus.AVAILABLE);
  });

  it('rejects uploads without a file', async () => {
    await expect(service.uploadObject(apiKey, bucketId, { key: 'file.txt' }, undefined)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects uploads when an active object already uses the same key', async () => {
    prisma.storageObject.findFirst.mockResolvedValue({ id: 'existing-object-id' });

    await expect(
      service.uploadObject(
        apiKey,
        bucketId,
        { key: 'avatars/user.png' },
        {
          originalname: 'user.png',
          mimetype: 'image/png',
          size: 4,
          buffer: Buffer.from('file')
        } as Express.Multer.File
      )
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.storageObject.create).not.toHaveBeenCalled();
    expect(provider.uploadObject).not.toHaveBeenCalled();
    expect(prisma.operationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        objectId: null,
        operation: OperationType.UPLOAD,
        status: OperationStatus.FAILED,
        provider: Provider.GOOGLE_DRIVE,
        errorCode: 'OBJECT_KEY_ALREADY_EXISTS'
      })
    }));
  });

  it('marks object metadata failed when provider upload fails', async () => {
    const providerError = new Error('provider unavailable');
    prisma.storageObject.create.mockResolvedValue({ id: 'object-id' });
    provider.uploadObject.mockRejectedValue(providerError);
    prisma.storageObject.update.mockResolvedValue({ id: 'object-id' });

    await expect(
      service.uploadObject(
        apiKey,
        bucketId,
        { key: 'avatars/user.png' },
        {
          originalname: 'user.png',
          mimetype: 'image/png',
          size: 4,
          buffer: Buffer.from('file')
        } as Express.Multer.File
      )
    ).rejects.toBe(providerError);

    expect(prisma.storageObject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: StorageObjectStatus.FAILED }
    }));
    expect(prisma.operationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operation: OperationType.UPLOAD,
        status: OperationStatus.FAILED
      })
    }));
  });

  it('downloads an available object through the storage provider and logs success', async () => {
    const stream = Readable.from(['file']);
    prisma.storageObject.findFirst.mockResolvedValue({
      provider: Provider.GOOGLE_DRIVE,
      providerFileId: 'provider-file-id',
      resolvedIntegrationId: null
    });
    provider.downloadObject.mockResolvedValue({
      stream,
      fileName: 'file.txt',
      contentType: 'text/plain',
      sizeBytes: 4
    });

    const response = await service.downloadObject(apiKey, bucketId, 'object-id');

    expect(provider.downloadObject).toHaveBeenCalledWith(expect.objectContaining({
      providerFileId: 'provider-file-id'
    }));
    expect(response.stream).toBe(stream);
    expect(prisma.operationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operation: OperationType.DOWNLOAD,
        status: OperationStatus.SUCCESS
      })
    }));
  });

  it('rejects downloads when the object is not available', async () => {
    prisma.storageObject.findFirst.mockResolvedValue(null);

    await expect(service.downloadObject(apiKey, bucketId, 'missing-object')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an object through the storage provider and marks metadata deleted', async () => {
    prisma.storageObject.findFirst.mockResolvedValue({
      provider: Provider.GOOGLE_DRIVE,
      providerFileId: 'provider-file-id',
      resolvedIntegrationId: null,
      status: StorageObjectStatus.AVAILABLE
    });
    provider.deleteObject.mockResolvedValue(undefined);
    prisma.storageObject.update.mockResolvedValue({ id: 'object-id' });

    await expect(service.deleteObject(apiKey, bucketId, 'object-id')).resolves.toBeUndefined();

    expect(provider.deleteObject).toHaveBeenCalledWith(expect.objectContaining({
      providerFileId: 'provider-file-id'
    }));
    expect(prisma.storageObject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: StorageObjectStatus.DELETING }
    }));
    expect(prisma.storageObject.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: StorageObjectStatus.DELETED })
    }));
    expect(prisma.operationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        operation: OperationType.DELETE,
        status: OperationStatus.SUCCESS
      })
    }));
  });

  it('keeps delete idempotent when object is already deleted', async () => {
    prisma.storageObject.findFirst.mockResolvedValue({
      provider: Provider.GOOGLE_DRIVE,
      providerFileId: 'provider-file-id',
      resolvedIntegrationId: null,
      status: StorageObjectStatus.DELETED
    });

    await expect(service.deleteObject(apiKey, bucketId, 'object-id')).resolves.toBeUndefined();

    expect(provider.deleteObject).not.toHaveBeenCalled();
    expect(prisma.storageObject.update).not.toHaveBeenCalled();
  });

  it('rejects operations for buckets outside the API key project', async () => {
    prisma.bucket.findFirst.mockResolvedValue(null);

    await expect(service.listObjects(apiKey, bucketId, {})).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects invalid list limits', async () => {
    await expect(service.listObjects(apiKey, bucketId, { limit: '0' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects uploads when the project owner cannot be resolved', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(
      service.uploadObject(
        apiKey,
        bucketId,
        { key: 'file.txt' },
        {
          originalname: 'file.txt',
          mimetype: 'text/plain',
          size: 4,
          buffer: Buffer.from('file')
        } as Express.Multer.File
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('bucket folder resolution on upload', () => {
    const uploadFile = {
      originalname: 'user.png',
      mimetype: 'image/png',
      size: 4,
      buffer: Buffer.from('file')
    } as Express.Multer.File;

    beforeEach(() => {
      prisma.storageObject.create.mockResolvedValue({ id: 'object-id' });
      provider.uploadObject.mockResolvedValue({
        providerFileId: 'google-file-id',
        fileName: 'user.png',
        contentType: 'image/png',
        sizeBytes: 4
      });
      prisma.storageObject.update.mockResolvedValue(persistedObject({ id: 'object-id', key: 'photo.png' }));
    });

    it('cria o bucket dentro da pasta raiz sid3 e persiste o id da pasta do bucket', async () => {
      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(prisma.providerIntegration.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: integrationId },
        select: { sid3RootFolderRef: true, sid3RootFolderStatus: true }
      });
      expect(provider.findFolderByName).toHaveBeenCalledWith('sid3', expect.any(Object));
      expect(provider.createFolder).toHaveBeenCalledWith('sid3', expect.any(Object));
      expect(prisma.providerIntegration.updateMany).toHaveBeenCalledWith({
        where: { id: integrationId, sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED },
        data: { sid3RootFolderRef: 'sid3-root-folder-id', sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED }
      });
      expect(provider.findOrCreateFolder).toHaveBeenCalledWith('fotos', expect.any(Object), 'sid3-root-folder-id');
      expect(prisma.bucket.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: bucketId, providerRootRef: null },
        data: { providerRootRef: 'drive-folder-id' }
      }));
      expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
        parentFolderId: 'drive-folder-id'
      }));
    });

    it('reuses cached providerRootRef for direct bucket without calling the Drive API', async () => {
      prisma.bucket.findFirst.mockResolvedValue({ ...bucket, providerRootRef: 'cached-folder-id' });

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(provider.isFolderUsable).toHaveBeenCalledWith('cached-folder-id', expect.any(Object));
      expect(provider.findOrCreateFolder).not.toHaveBeenCalled();
      expect(prisma.providerIntegration.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
        parentFolderId: 'cached-folder-id'
      }));
    });

    it('recria a pasta do bucket quando o providerRootRef em cache aponta para uma pasta na lixeira', async () => {
      prisma.bucket.findFirst.mockResolvedValue({ ...bucket, providerRootRef: 'trashed-folder-id' });
      provider.isFolderUsable.mockResolvedValue(false);

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(provider.isFolderUsable).toHaveBeenCalledWith('trashed-folder-id', expect.any(Object));
      expect(prisma.bucket.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: bucketId, providerRootRef: 'trashed-folder-id' },
        data: { providerRootRef: null }
      }));
      expect(provider.createFolder).toHaveBeenCalledWith('sid3', expect.any(Object));
      expect(provider.findOrCreateFolder).toHaveBeenCalledWith('fotos', expect.any(Object), 'sid3-root-folder-id');
      expect(prisma.bucket.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: bucketId, providerRootRef: null },
        data: { providerRootRef: 'drive-folder-id' }
      }));
      expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
        parentFolderId: 'drive-folder-id'
      }));
    });

    it('reutiliza a pasta raiz sid3 já confirmada sem chamar o Drive novamente', async () => {
      prisma.providerIntegration.findUniqueOrThrow.mockResolvedValue({
        sid3RootFolderRef: 'confirmed-sid3-id',
        sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
      });

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(provider.isFolderUsable).toHaveBeenCalledWith('confirmed-sid3-id', expect.any(Object));
      expect(provider.findFolderByName).not.toHaveBeenCalled();
      expect(provider.createFolder).not.toHaveBeenCalled();
      expect(provider.findOrCreateFolder).toHaveBeenCalledWith('fotos', expect.any(Object), 'confirmed-sid3-id');
    });

    it('recria a pasta raiz sid3 quando a confirmada em cache foi apagada no Drive', async () => {
      prisma.providerIntegration.findUniqueOrThrow
        .mockResolvedValueOnce({
          sid3RootFolderRef: 'trashed-sid3-id',
          sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
        })
        .mockResolvedValueOnce({
          sid3RootFolderRef: null,
          sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED
        });
      provider.isFolderUsable.mockResolvedValue(false);

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(prisma.providerIntegration.updateMany).toHaveBeenCalledWith({
        where: { id: integrationId, sid3RootFolderRef: 'trashed-sid3-id' },
        data: { sid3RootFolderRef: null, sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED }
      });
      expect(provider.createFolder).toHaveBeenCalledWith('sid3', expect.any(Object));
      expect(provider.findOrCreateFolder).toHaveBeenCalledWith('fotos', expect.any(Object), 'sid3-root-folder-id');
    });

    it('bloqueia o upload quando encontra uma pasta "sid3" pré-existente e pede confirmação do usuário', async () => {
      provider.findFolderByName.mockResolvedValue('pre-existing-sid3-id');

      await expect(
        service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile)
      ).rejects.toBeInstanceOf(ConflictException);

      expect(prisma.providerIntegration.updateMany).toHaveBeenCalledWith({
        where: { id: integrationId, sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED },
        data: { sid3RootFolderRef: 'pre-existing-sid3-id', sid3RootFolderStatus: Sid3RootFolderStatus.PENDING_CONFIRMATION }
      });
      expect(provider.createFolder).not.toHaveBeenCalled();
      expect(prisma.storageObject.create).not.toHaveBeenCalled();
    });

    it('bloqueia o upload quando a pasta "sid3" já está aguardando confirmação', async () => {
      prisma.providerIntegration.findUniqueOrThrow.mockResolvedValue({
        sid3RootFolderRef: 'pre-existing-sid3-id',
        sid3RootFolderStatus: Sid3RootFolderStatus.PENDING_CONFIRMATION
      });

      await expect(
        service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile)
      ).rejects.toBeInstanceOf(ConflictException);

      expect(provider.findFolderByName).not.toHaveBeenCalled();
      expect(provider.createFolder).not.toHaveBeenCalled();
      expect(prisma.storageObject.create).not.toHaveBeenCalled();
    });

    it('relê o estado da pasta raiz sid3 quando perde a corrida de criação para outra requisição', async () => {
      prisma.providerIntegration.findUniqueOrThrow
        .mockResolvedValueOnce({
          sid3RootFolderRef: null,
          sid3RootFolderStatus: Sid3RootFolderStatus.NOT_RESOLVED
        })
        .mockResolvedValueOnce({
          sid3RootFolderRef: 'winner-sid3-id',
          sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED
        });
      prisma.providerIntegration.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(prisma.providerIntegration.findUniqueOrThrow).toHaveBeenCalledTimes(2);
      expect(provider.findOrCreateFolder).toHaveBeenCalledWith('fotos', expect.any(Object), 'winner-sid3-id');
    });

    it('cria o bucket de pool dentro da pasta raiz sid3 da integração selecionada', async () => {
      const poolBucket = {
        ...bucket,
        providerIntegrationId: null,
        providerIntegration: null,
        storagePoolId: 'pool-id',
        storagePool: {
          strategy: 'ROUND_ROBIN',
          members: [{
            id: 'member-id',
            providerIntegrationId: 'pool-integration-id',
            weight: 1,
            roundRobinIndex: 0,
            providerIntegration: {
              provider: Provider.GOOGLE_DRIVE,
              encryptedAccessToken: 'encrypted-access',
              encryptedRefreshToken: null,
              tokenExpiresAt: null
            }
          }]
        }
      };
      prisma.bucket.findFirst.mockResolvedValue(poolBucket);
      const selectMember = jest.fn().mockResolvedValue({
        memberId: 'member-id',
        providerIntegrationId: 'pool-integration-id',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      });
      const registry = { getProvider: jest.fn().mockReturnValue(provider) } as unknown as StorageProviderRegistry;
      const poolRoutingFactory = { getStrategy: jest.fn().mockReturnValue({ selectMember }) } as unknown as PoolRoutingFactory;
      service = new ObjectsService(prisma as unknown as PrismaService, registry, poolRoutingFactory);

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(prisma.providerIntegration.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'pool-integration-id' },
        select: { sid3RootFolderRef: true, sid3RootFolderStatus: true }
      });
      expect(provider.findFolderByName).toHaveBeenCalledWith('sid3', expect.any(Object));
      expect(provider.createFolder).toHaveBeenCalledWith('sid3', expect.any(Object));
      expect(provider.findOrCreateFolder).toHaveBeenCalledWith('fotos', expect.any(Object), 'sid3-root-folder-id');
      expect(prisma.bucketFolderRef.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          bucketId,
          providerIntegrationId: 'pool-integration-id',
          folderId: 'drive-folder-id'
        })
      }));
      expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
        parentFolderId: 'drive-folder-id'
      }));
    });

    it('reuses BucketFolderRef cache for pool bucket without calling the Drive API', async () => {
      const poolBucket = {
        ...bucket,
        providerIntegrationId: null,
        providerIntegration: null,
        storagePoolId: 'pool-id',
        storagePool: {
          strategy: 'ROUND_ROBIN',
          members: [{
            id: 'member-id',
            providerIntegrationId: 'pool-integration-id',
            weight: 1,
            roundRobinIndex: 0,
            providerIntegration: {
              provider: Provider.GOOGLE_DRIVE,
              encryptedAccessToken: 'encrypted-access',
              encryptedRefreshToken: null,
              tokenExpiresAt: null
            }
          }]
        }
      };
      prisma.bucket.findFirst.mockResolvedValue(poolBucket);
      prisma.bucketFolderRef.findUnique.mockResolvedValue({ folderId: 'cached-pool-folder-id' });
      const selectMember = jest.fn().mockResolvedValue({
        memberId: 'member-id',
        providerIntegrationId: 'pool-integration-id',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      });
      const registry = { getProvider: jest.fn().mockReturnValue(provider) } as unknown as StorageProviderRegistry;
      const poolRoutingFactory = { getStrategy: jest.fn().mockReturnValue({ selectMember }) } as unknown as PoolRoutingFactory;
      service = new ObjectsService(prisma as unknown as PrismaService, registry, poolRoutingFactory);

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(provider.isFolderUsable).toHaveBeenCalledWith('cached-pool-folder-id', expect.any(Object));
      expect(provider.findOrCreateFolder).not.toHaveBeenCalled();
      expect(prisma.providerIntegration.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
        parentFolderId: 'cached-pool-folder-id'
      }));
    });

    it('recria o BucketFolderRef de pool quando a pasta em cache foi apagada no Drive', async () => {
      const poolBucket = {
        ...bucket,
        providerIntegrationId: null,
        providerIntegration: null,
        storagePoolId: 'pool-id',
        storagePool: {
          strategy: 'ROUND_ROBIN',
          members: [{
            id: 'member-id',
            providerIntegrationId: 'pool-integration-id',
            weight: 1,
            roundRobinIndex: 0,
            providerIntegration: {
              provider: Provider.GOOGLE_DRIVE,
              encryptedAccessToken: 'encrypted-access',
              encryptedRefreshToken: null,
              tokenExpiresAt: null
            }
          }]
        }
      };
      prisma.bucket.findFirst.mockResolvedValue(poolBucket);
      prisma.bucketFolderRef.findUnique.mockResolvedValue({ folderId: 'trashed-pool-folder-id' });
      provider.isFolderUsable.mockResolvedValue(false);
      const selectMember = jest.fn().mockResolvedValue({
        memberId: 'member-id',
        providerIntegrationId: 'pool-integration-id',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      });
      const registry = { getProvider: jest.fn().mockReturnValue(provider) } as unknown as StorageProviderRegistry;
      const poolRoutingFactory = { getStrategy: jest.fn().mockReturnValue({ selectMember }) } as unknown as PoolRoutingFactory;
      service = new ObjectsService(prisma as unknown as PrismaService, registry, poolRoutingFactory);

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(provider.isFolderUsable).toHaveBeenCalledWith('trashed-pool-folder-id', expect.any(Object));
      expect(prisma.bucketFolderRef.deleteMany).toHaveBeenCalledWith({
        where: { bucketId, providerIntegrationId: 'pool-integration-id', folderId: 'trashed-pool-folder-id' }
      });
      expect(prisma.bucketFolderRef.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          bucketId,
          providerIntegrationId: 'pool-integration-id',
          folderId: 'drive-folder-id'
        })
      }));
    });

    it('handles race condition on BucketFolderRef create by falling back to findUniqueOrThrow', async () => {
      const poolBucket = {
        ...bucket,
        providerIntegrationId: null,
        providerIntegration: null,
        storagePoolId: 'pool-id',
        storagePool: {
          strategy: 'ROUND_ROBIN',
          members: [{
            id: 'member-id',
            providerIntegrationId: 'pool-integration-id',
            weight: 1,
            roundRobinIndex: 0,
            providerIntegration: {
              provider: Provider.GOOGLE_DRIVE,
              encryptedAccessToken: 'encrypted-access',
              encryptedRefreshToken: null,
              tokenExpiresAt: null
            }
          }]
        }
      };
      prisma.bucket.findFirst.mockResolvedValue(poolBucket);

      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.0.0',
        meta: { target: ['bucket_id', 'provider_integration_id'] }
      });
      prisma.bucketFolderRef.create.mockRejectedValue(p2002Error);
      prisma.bucketFolderRef.findUniqueOrThrow.mockResolvedValue({ folderId: 'race-folder-id' });

      const selectMember = jest.fn().mockResolvedValue({
        memberId: 'member-id',
        providerIntegrationId: 'pool-integration-id',
        encryptedAccessToken: 'encrypted-access',
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      });
      const registry = { getProvider: jest.fn().mockReturnValue(provider) } as unknown as StorageProviderRegistry;
      const poolRoutingFactory = { getStrategy: jest.fn().mockReturnValue({ selectMember }) } as unknown as PoolRoutingFactory;
      service = new ObjectsService(prisma as unknown as PrismaService, registry, poolRoutingFactory);

      await service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile);

      expect(prisma.bucketFolderRef.findUniqueOrThrow).toHaveBeenCalled();
      expect(provider.uploadObject).toHaveBeenCalledWith(expect.objectContaining({
        parentFolderId: 'race-folder-id'
      }));
    });

    it('does not create StorageObject when Drive folder resolution fails', async () => {
      provider.findOrCreateFolder.mockRejectedValue(new BadGatewayException('Drive error'));

      await expect(
        service.uploadObject(apiKey, bucketId, { key: 'photo.png' }, uploadFile)
      ).rejects.toBeInstanceOf(BadGatewayException);

      expect(prisma.storageObject.create).not.toHaveBeenCalled();
    });
  });
});

function persistedObject(overrides: Partial<{ id: string; key: string; providerFileId: string }>) {
  return {
    id: overrides.id ?? 'object-id',
    bucketId: 'bucket-id',
    key: overrides.key ?? 'file.txt',
    providerFileId: overrides.providerFileId ?? 'provider-file-id',
    fileName: 'user.png',
    contentType: 'image/png',
    sizeBytes: BigInt(4),
    checksumSha256: 'checksum',
    status: StorageObjectStatus.AVAILABLE,
    createdAt,
    updatedAt: createdAt
  };
}
