import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { Prisma, Provider, ProviderIntegrationStatus, PoolRoutingStrategy } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StoragePoolsService } from './storage-pools.service';

type ProjectDelegateMock = {
  findFirst: jest.Mock;
};

type StoragePoolDelegateMock = {
  findMany: jest.Mock;
  create: jest.Mock;
  findFirst: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
};

type ProviderIntegrationDelegateMock = {
  findFirst: jest.Mock;
};

type StoragePoolMemberDelegateMock = {
  create: jest.Mock;
  findFirst: jest.Mock;
  delete: jest.Mock;
};

describe(StoragePoolsService.name, () => {
  const ownerUserId = '6e3fae8f-f660-4d7a-b90d-5925771cf893';
  const projectId = '4d203084-8eab-463d-9c58-ae536fe7db8f';
  const poolId = '59e06757-d715-446b-9da9-14cc56af4265';
  const memberId = '7e98e54a-953c-417f-8070-d6e5579a2cc1';
  const connectionId = 'ab9cbe1f-7ad5-4f75-b07f-f8ab3169b1d7';
  const createdAt = new Date('2026-06-11T10:00:00.000Z');
  const updatedAt = new Date('2026-06-11T10:05:00.000Z');

  let projectDelegate: ProjectDelegateMock;
  let storagePoolDelegate: StoragePoolDelegateMock;
  let providerIntegrationDelegate: ProviderIntegrationDelegateMock;
  let storagePoolMemberDelegate: StoragePoolMemberDelegateMock;
  let service: StoragePoolsService;

  const persistedMember = {
    id: memberId,
    providerIntegrationId: connectionId,
    weight: 2,
    createdAt,
    providerIntegration: {
      provider: Provider.GOOGLE_DRIVE,
      displayName: 'Drive principal',
      providerAccountEmail: 'drive@example.com',
      status: ProviderIntegrationStatus.CONNECTED
    }
  };

  const persistedPool = {
    id: poolId,
    projectId,
    name: 'Pool A',
    strategy: PoolRoutingStrategy.ROUND_ROBIN,
    createdAt,
    updatedAt,
    members: [persistedMember]
  };

  beforeEach(() => {
    projectDelegate = {
      findFirst: jest.fn().mockResolvedValue({ id: projectId })
    };
    storagePoolDelegate = {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(persistedPool),
      update: jest.fn(),
      delete: jest.fn()
    };
    providerIntegrationDelegate = {
      findFirst: jest.fn().mockResolvedValue({
        id: connectionId,
        status: ProviderIntegrationStatus.CONNECTED
      })
    };
    storagePoolMemberDelegate = {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn()
    };

    const prisma = {
      project: projectDelegate,
      storagePool: storagePoolDelegate,
      providerIntegration: providerIntegrationDelegate,
      storagePoolMember: storagePoolMemberDelegate
    } as unknown as PrismaService;

    service = new StoragePoolsService(prisma);
  });

  it('lists pools from an owned project', async () => {
    storagePoolDelegate.findMany.mockResolvedValue([persistedPool]);

    const response = await service.listPools(ownerUserId, projectId);

    expect(storagePoolDelegate.findMany).toHaveBeenCalledWith({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: expect.any(Object)
    });
    expect(response).toEqual([
      {
        id: poolId,
        projectId,
        name: 'Pool A',
        strategy: PoolRoutingStrategy.ROUND_ROBIN,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
        members: [
          {
            id: memberId,
            connectionId,
            provider: Provider.GOOGLE_DRIVE,
            displayName: 'Drive principal',
            providerAccountEmail: 'drive@example.com',
            connectionStatus: ProviderIntegrationStatus.CONNECTED,
            weight: 2,
            createdAt: createdAt.toISOString()
          }
        ]
      }
    ]);
  });

  it('creates a pool with trimmed name and default strategy', async () => {
    storagePoolDelegate.create.mockResolvedValue(persistedPool);

    const response = await service.createPool(ownerUserId, projectId, {
      name: ' Pool A '
    });

    expect(storagePoolDelegate.create).toHaveBeenCalledWith({
      data: {
        projectId,
        name: 'Pool A',
        strategy: 'ROUND_ROBIN'
      },
      select: expect.any(Object)
    });
    expect(response.name).toBe('Pool A');
  });

  it('returns a single owned pool', async () => {
    const response = await service.getPool(ownerUserId, poolId);
    expect(response.id).toBe(poolId);
  });

  it('updates pool name and strategy', async () => {
    storagePoolDelegate.update.mockResolvedValue({
      ...persistedPool,
      name: 'Pool B',
      strategy: PoolRoutingStrategy.WEIGHTED
    });

    const response = await service.updatePool(ownerUserId, poolId, {
      name: ' Pool B ',
      strategy: PoolRoutingStrategy.WEIGHTED
    });

    expect(storagePoolDelegate.update).toHaveBeenCalledWith({
      where: { id: poolId },
      data: {
        name: 'Pool B',
        strategy: PoolRoutingStrategy.WEIGHTED
      },
      select: expect.any(Object)
    });
    expect(response.name).toBe('Pool B');
    expect(response.strategy).toBe(PoolRoutingStrategy.WEIGHTED);
  });

  it('deletes a pool when it is not in use', async () => {
    await service.deletePool(ownerUserId, poolId);
    expect(storagePoolDelegate.delete).toHaveBeenCalledWith({ where: { id: poolId } });
  });

  it('adds a connected integration as a member', async () => {
    storagePoolMemberDelegate.create.mockResolvedValue(persistedMember);

    const response = await service.addMember(ownerUserId, poolId, {
      connectionId,
      weight: 2
    });

    expect(providerIntegrationDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: connectionId, userId: ownerUserId },
      select: { id: true, status: true }
    });
    expect(storagePoolMemberDelegate.create).toHaveBeenCalledWith({
      data: {
        poolId,
        providerIntegrationId: connectionId,
        weight: 2
      },
      select: expect.any(Object)
    });
    expect(response.weight).toBe(2);
  });

  it('removes a member from an owned pool', async () => {
    storagePoolMemberDelegate.findFirst.mockResolvedValue({ id: memberId });

    await service.removeMember(ownerUserId, poolId, memberId);

    expect(storagePoolMemberDelegate.delete).toHaveBeenCalledWith({ where: { id: memberId } });
  });

  it('rejects pool creation on duplicate name', async () => {
    storagePoolDelegate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    await expect(service.createPool(ownerUserId, projectId, { name: 'Pool A' })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('rejects pool update on duplicate name', async () => {
    storagePoolDelegate.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    await expect(service.updatePool(ownerUserId, poolId, { name: 'Pool A' })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('rejects pool deletion when buckets still reference it', async () => {
    storagePoolDelegate.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test'
      })
    );

    await expect(service.deletePool(ownerUserId, poolId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects member creation for unknown connections', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue(null);

    await expect(service.addMember(ownerUserId, poolId, { connectionId })).rejects.toBeInstanceOf(
      UnauthorizedException
    );
  });

  it('rejects member creation for inactive connections', async () => {
    providerIntegrationDelegate.findFirst.mockResolvedValue({
      id: connectionId,
      status: ProviderIntegrationStatus.REVOKED
    });

    await expect(service.addMember(ownerUserId, poolId, { connectionId })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('rejects duplicate pool member creation', async () => {
    storagePoolMemberDelegate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    await expect(service.addMember(ownerUserId, poolId, { connectionId })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it('rejects removing an unknown member', async () => {
    storagePoolMemberDelegate.findFirst.mockResolvedValue(null);

    await expect(service.removeMember(ownerUserId, poolId, memberId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects access to pools outside current user scope', async () => {
    storagePoolDelegate.findFirst.mockResolvedValueOnce(null);

    await expect(service.getPool(ownerUserId, poolId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects list operation when project is outside current user scope', async () => {
    projectDelegate.findFirst.mockResolvedValue(null);

    await expect(service.listPools(ownerUserId, projectId)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
