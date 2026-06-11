import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BucketsService } from './buckets.service';

type ProjectDelegateMock = {
  findFirst: jest.Mock;
};

type ProviderIntegrationDelegateMock = {
  findFirst: jest.Mock;
};

type StoragePoolDelegateMock = {
  findFirst: jest.Mock;
};

type BucketDelegateMock = {
  create: jest.Mock;
  findMany: jest.Mock;
};

describe(BucketsService.name, () => {
  const ownerUserId = '956ee8de-29d9-4b9e-818d-05bdc92e79a6';
  const projectId = '7d3cb801-1c16-4ce5-98ea-1c8a3c916945';
  const providerIntegrationId = 'ab2e7910-639b-4832-8d2a-4037e9f64d47';
  const storagePoolId = 'dd4f1e2c-9a88-4c8b-bc18-1234567890ab';
  const bucketId = 'cf2e39f6-59d7-4d0f-8522-5ba4737752a3';
  const createdAt = new Date('2026-05-24T13:40:00.000Z');
  const persistedBucket = {
    id: bucketId,
    projectId,
    name: 'avatars',
    providerIntegrationId,
    storagePoolId: null,
    createdAt
  };

  let projectDelegate: ProjectDelegateMock;
  let providerIntegrationDelegate: ProviderIntegrationDelegateMock;
  let storagePoolDelegate: StoragePoolDelegateMock;
  let bucketDelegate: BucketDelegateMock;
  let service: BucketsService;

  beforeEach(() => {
    projectDelegate = {
      findFirst: jest.fn().mockResolvedValue({ id: projectId })
    };
    providerIntegrationDelegate = {
      findFirst: jest.fn().mockResolvedValue({
        id: providerIntegrationId,
        status: ProviderIntegrationStatus.CONNECTED
      })
    };
    storagePoolDelegate = {
      findFirst: jest.fn().mockResolvedValue({
        id: storagePoolId,
        _count: { members: 2 }
      })
    };
    bucketDelegate = {
      create: jest.fn(),
      findMany: jest.fn()
    };

    const prisma = {
      project: projectDelegate,
      providerIntegration: providerIntegrationDelegate,
      storagePool: storagePoolDelegate,
      bucket: bucketDelegate
    } as unknown as PrismaService;

    service = new BucketsService(prisma);
  });

  it('creates a bucket for an owned project and connected integration', async () => {
    bucketDelegate.create.mockResolvedValue(persistedBucket);

    const response = await service.createBucket(ownerUserId, projectId, {
      name: 'avatars',
      providerIntegrationId
    });

    expect(projectDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, ownerUserId },
      select: { id: true }
    });
    expect(providerIntegrationDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: providerIntegrationId, userId: ownerUserId },
      select: { id: true, status: true }
    });
    expect(bucketDelegate.create).toHaveBeenCalledWith({
      data: {
        projectId,
        name: 'avatars',
        providerIntegrationId,
        storagePoolId: null
      },
      select: expect.any(Object)
    });
    expect(response).toEqual({
      id: bucketId,
      projectId,
      name: 'avatars',
      providerIntegrationId,
      storagePoolId: null,
      createdAt: createdAt.toISOString()
    });
  });

  it('creates a bucket linked to a storage pool', async () => {
    const poolBucket = { ...persistedBucket, providerIntegrationId: null, storagePoolId };
    bucketDelegate.create.mockResolvedValue(poolBucket);

    const response = await service.createBucket(ownerUserId, projectId, {
      name: 'avatars',
      storagePoolId
    });

    expect(storagePoolDelegate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: storagePoolId })
      })
    );
    expect(bucketDelegate.create).toHaveBeenCalledWith({
      data: {
        projectId,
        name: 'avatars',
        providerIntegrationId: null,
        storagePoolId
      },
      select: expect.any(Object)
    });
    expect(response.storagePoolId).toBe(storagePoolId);
    expect(response.providerIntegrationId).toBeNull();
  });

  it('rejects bucket creation when neither providerIntegrationId nor storagePoolId is provided', async () => {
    await expect(
      service.createBucket(ownerUserId, projectId, { name: 'avatars' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects bucket creation when both providerIntegrationId and storagePoolId are provided', async () => {
    await expect(
      service.createBucket(ownerUserId, projectId, {
        name: 'avatars',
        providerIntegrationId,
        storagePoolId
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects bucket creation when pool has no members', async () => {
    storagePoolDelegate.findFirst.mockResolvedValue({
      id: storagePoolId,
      _count: { members: 0 }
    });

    await expect(
      service.createBucket(ownerUserId, projectId, { name: 'avatars', storagePoolId })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists buckets for an owned project', async () => {
    bucketDelegate.findMany.mockResolvedValue([persistedBucket]);

    const response = await service.listBuckets(ownerUserId, projectId);

    expect(bucketDelegate.findMany).toHaveBeenCalledWith({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: expect.any(Object)
    });
    expect(response).toHaveLength(1);
    expect(response.at(0)?.name).toBe('avatars');
  });

  it('rejects duplicate bucket names for the same project', async () => {
    bucketDelegate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    await expect(
      service.createBucket(ownerUserId, projectId, {
        name: 'avatars',
        providerIntegrationId
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects buckets for projects outside the current user', async () => {
    projectDelegate.findFirst.mockResolvedValue(null);

    await expect(service.listBuckets(ownerUserId, projectId)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects provider integrations outside the current user', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue(null);

    await expect(
      service.createBucket(ownerUserId, projectId, {
        name: 'avatars',
        providerIntegrationId
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects revoked provider integrations', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue({
      id: providerIntegrationId,
      status: ProviderIntegrationStatus.REVOKED
    });

    await expect(
      service.createBucket(ownerUserId, projectId, {
        name: 'avatars',
        providerIntegrationId
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
