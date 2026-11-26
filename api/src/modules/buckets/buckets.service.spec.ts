import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectConnectionsService } from '../projects/project-connections.service';
import { BucketsService } from './buckets.service';

describe(BucketsService.name, () => {
  const ownerUserId = '956ee8de-29d9-4b9e-818d-05bdc92e79a6';
  const projectId = '7d3cb801-1c16-4ce5-98ea-1c8a3c916945';
  const providerIntegrationId = 'ab2e7910-639b-4832-8d2a-4037e9f64d47';
  const otherIntegrationId = 'b1c7e2a0-4b5d-4e3f-9a8b-7c6d5e4f3a2b';
  const storagePoolId = 'dd4f1e2c-9a88-4c8b-bc18-1234567890ab';
  const bucketId = 'cf2e39f6-59d7-4d0f-8522-5ba4737752a3';
  const createdAt = new Date('2026-05-24T13:40:00.000Z');
  const persistedBucket = {
    id: bucketId,
    projectId,
    name: 'avatars',
    providerIntegrationId,
    storagePoolId: null,
    createdAt,
    _count: { storageObjects: 3 }
  };

  let prisma: {
    project: { findFirst: jest.Mock };
    storagePool: { findFirst: jest.Mock };
    bucket: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
    storageObject: { count: jest.Mock; deleteMany: jest.Mock };
  };
  let projectConnections: { assertUsableInProject: jest.Mock };
  let service: BucketsService;

  beforeEach(() => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: projectId }) },
      storagePool: { findFirst: jest.fn().mockResolvedValue({ id: storagePoolId, _count: { members: 2 } }) },
      bucket: {
        create: jest.fn().mockResolvedValue(persistedBucket),
        findMany: jest.fn().mockResolvedValue([persistedBucket]),
        findFirst: jest.fn().mockResolvedValue({ id: bucketId, providerIntegrationId, storagePoolId: null }),
        update: jest.fn().mockResolvedValue(persistedBucket),
        delete: jest.fn().mockResolvedValue({ id: bucketId })
      },
      storageObject: { count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) }
    };
    projectConnections = { assertUsableInProject: jest.fn().mockResolvedValue(undefined) };
    service = new BucketsService(
      prisma as unknown as PrismaService,
      projectConnections as unknown as ProjectConnectionsService
    );
  });

  it('creates a bucket on a connection linked to the project', async () => {
    const response = await service.createBucket(ownerUserId, projectId, { name: 'avatars', providerIntegrationId });

    expect(projectConnections.assertUsableInProject).toHaveBeenCalledWith(projectId, providerIntegrationId);
    expect(prisma.bucket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { projectId, name: 'avatars', providerIntegrationId, storagePoolId: null }
      })
    );
    expect(response).toEqual({
      id: bucketId,
      projectId,
      name: 'avatars',
      providerIntegrationId,
      storagePoolId: null,
      objectCount: 3,
      createdAt: createdAt.toISOString()
    });
  });

  it('rejects a connection that is not linked to the project', async () => {
    projectConnections.assertUsableInProject.mockRejectedValue(new BadRequestException('não vinculada'));

    await expect(
      service.createBucket(ownerUserId, projectId, { name: 'avatars', providerIntegrationId })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.bucket.create).not.toHaveBeenCalled();
  });

  it('only accepts pools from the same project', async () => {
    prisma.storagePool.findFirst.mockResolvedValue(null);

    await expect(service.createBucket(ownerUserId, projectId, { name: 'avatars', storagePoolId })).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(prisma.storagePool.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: storagePoolId, projectId } })
    );
  });

  it('requires exactly one destination', async () => {
    await expect(service.createBucket(ownerUserId, projectId, { name: 'avatars' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.createBucket(ownerUserId, projectId, { name: 'avatars', providerIntegrationId, storagePoolId })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps duplicate bucket names to conflict', async () => {
    prisma.bucket.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' })
    );

    await expect(
      service.createBucket(ownerUserId, projectId, { name: 'avatars', providerIntegrationId })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects projects the user does not own', async () => {
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(service.listBuckets(ownerUserId, projectId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('changes the destination of new uploads and resets the cached Drive folder', async () => {
    await service.updateBucket(ownerUserId, projectId, bucketId, { providerIntegrationId: otherIntegrationId });

    expect(projectConnections.assertUsableInProject).toHaveBeenCalledWith(projectId, otherIntegrationId);
    expect(prisma.bucket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bucketId },
        data: { providerIntegrationId: otherIntegrationId, storagePoolId: null, providerRootRef: null }
      })
    );
  });

  it('renames a bucket without touching its destination', async () => {
    await service.updateBucket(ownerUserId, projectId, bucketId, { name: 'fotos' });

    expect(projectConnections.assertUsableInProject).not.toHaveBeenCalled();
    expect(prisma.bucket.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'fotos' } }));
  });

  it('refuses to delete a bucket that still has files', async () => {
    prisma.storageObject.count.mockResolvedValue(211298);

    await expect(service.deleteBucket(ownerUserId, projectId, bucketId)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bucket.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty bucket', async () => {
    await service.deleteBucket(ownerUserId, projectId, bucketId);

    expect(prisma.bucket.delete).toHaveBeenCalledWith({ where: { id: bucketId } });
  });
});
