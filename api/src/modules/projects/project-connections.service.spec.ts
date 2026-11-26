import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, ProviderIntegrationStatus, Sid3RootFolderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectConnectionsService } from './project-connections.service';
import { ProjectsService } from './projects.service';

describe(ProjectConnectionsService.name, () => {
  const ownerUserId = 'user-id';
  const projectId = 'project-id';
  const connectionId = 'connection-id';
  const link = {
    createdAt: new Date('2026-11-26T10:00:00.000Z'),
    providerIntegration: {
      id: connectionId,
      displayName: 'Drive da Paula',
      providerAccountEmail: 'paula@example.com',
      status: ProviderIntegrationStatus.CONNECTED,
      sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED,
      lastError: null,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      _count: { buckets: 1 }
    }
  };

  let prisma: {
    providerIntegration: { findFirst: jest.Mock };
    projectConnection: { findMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
    bucket: { count: jest.Mock };
    storagePoolMember: { count: jest.Mock };
    storageObject: { count: jest.Mock };
  };
  let projectsService: { findOwnedProject: jest.Mock };
  let service: ProjectConnectionsService;

  beforeEach(() => {
    prisma = {
      providerIntegration: {
        findFirst: jest.fn().mockResolvedValue({ id: connectionId, status: ProviderIntegrationStatus.CONNECTED })
      },
      projectConnection: {
        findMany: jest.fn().mockResolvedValue([link]),
        create: jest.fn().mockResolvedValue(link),
        findUnique: jest.fn().mockResolvedValue({ id: 'link-id' }),
        delete: jest.fn().mockResolvedValue({ id: 'link-id' })
      },
      bucket: { count: jest.fn().mockResolvedValue(0) },
      storagePoolMember: { count: jest.fn().mockResolvedValue(0) },
      storageObject: { count: jest.fn().mockResolvedValue(0) }
    };
    projectsService = { findOwnedProject: jest.fn().mockResolvedValue({ id: projectId, name: 'Paula' }) };
    service = new ProjectConnectionsService(
      prisma as unknown as PrismaService,
      projectsService as unknown as ProjectsService
    );
  });

  it('links an existing connection to a project', async () => {
    const response = await service.linkConnection(ownerUserId, projectId, connectionId);

    expect(prisma.projectConnection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { projectId, providerIntegrationId: connectionId } })
    );
    expect(response).toEqual({
      connectionId,
      displayName: 'Drive da Paula',
      providerAccountEmail: 'paula@example.com',
      status: ProviderIntegrationStatus.CONNECTED,
      sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED,
      lastError: null,
      canBrowseDrive: true,
      bucketCount: 1,
      linkedAt: '2026-11-26T10:00:00.000Z'
    });
  });

  it('rejects connections of other users and revoked connections', async () => {
    prisma.providerIntegration.findFirst.mockResolvedValueOnce(null);
    await expect(service.linkConnection(ownerUserId, projectId, connectionId)).rejects.toBeInstanceOf(NotFoundException);

    prisma.providerIntegration.findFirst.mockResolvedValueOnce({ id: connectionId, status: ProviderIntegrationStatus.REVOKED });
    await expect(service.linkConnection(ownerUserId, projectId, connectionId)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a duplicate link to conflict', async () => {
    prisma.projectConnection.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: 'test' })
    );

    await expect(service.linkConnection(ownerUserId, projectId, connectionId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to unlink a connection still used by the project', async () => {
    prisma.storageObject.count.mockResolvedValue(10);

    await expect(service.unlinkConnection(ownerUserId, projectId, connectionId)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.projectConnection.delete).not.toHaveBeenCalled();
  });

  it('unlinks an unused connection without deleting it', async () => {
    await service.unlinkConnection(ownerUserId, projectId, connectionId);

    expect(prisma.projectConnection.delete).toHaveBeenCalledWith({ where: { id: 'link-id' } });
  });

  it('requires the connection to be linked and active before buckets use it', async () => {
    prisma.projectConnection.findUnique.mockResolvedValueOnce(null);
    await expect(service.assertUsableInProject(projectId, connectionId)).rejects.toBeInstanceOf(BadRequestException);

    prisma.projectConnection.findUnique.mockResolvedValueOnce({
      providerIntegration: { status: ProviderIntegrationStatus.ERROR }
    });
    await expect(service.assertUsableInProject(projectId, connectionId)).rejects.toBeInstanceOf(BadRequestException);

    prisma.projectConnection.findUnique.mockResolvedValueOnce({
      providerIntegration: { status: ProviderIntegrationStatus.CONNECTED }
    });
    await expect(service.assertUsableInProject(projectId, connectionId)).resolves.toBeUndefined();
  });
});
