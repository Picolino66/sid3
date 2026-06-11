import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectsService } from './projects.service';

type UserDelegateMock = {
  findUnique: jest.Mock;
};

type ProjectDelegateMock = {
  create: jest.Mock;
  findMany: jest.Mock;
};

describe(ProjectsService.name, () => {
  const ownerUserId = 'b760ab0c-3e82-46f4-b508-54f0b0f15cd0';
  const createdAt = new Date('2026-05-24T12:30:00.000Z');

  let userDelegate: UserDelegateMock;
  let projectDelegate: ProjectDelegateMock;
  let service: ProjectsService;

  beforeEach(() => {
    userDelegate = {
      findUnique: jest.fn().mockResolvedValue({ id: ownerUserId })
    };
    projectDelegate = {
      create: jest.fn(),
      findMany: jest.fn()
    };

    const prisma = {
      user: userDelegate,
      project: projectDelegate
    } as unknown as PrismaService;

    service = new ProjectsService(prisma);
  });

  it('creates a project for the authenticated owner with a normalized slug', async () => {
    projectDelegate.create.mockResolvedValue({
      id: '937d53d7-13d5-4f3d-96e0-7e8fef3717ad',
      name: 'Mídia Storage',
      slug: 'midia-storage',
      createdAt
    });

    const response = await service.createProject(ownerUserId, {
      name: ' Mídia Storage '
    });

    expect(userDelegate.findUnique).toHaveBeenCalledWith({
      where: { id: ownerUserId },
      select: { id: true }
    });
    expect(projectDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          ownerUserId,
          name: 'Mídia Storage',
          slug: 'midia-storage'
        }
      })
    );
    expect(response).toEqual({
      id: '937d53d7-13d5-4f3d-96e0-7e8fef3717ad',
      name: 'Mídia Storage',
      slug: 'midia-storage',
      createdAt: createdAt.toISOString()
    });
  });

  it('lists only projects owned by the authenticated user', async () => {
    projectDelegate.findMany.mockResolvedValue([
      {
        id: '937d53d7-13d5-4f3d-96e0-7e8fef3717ad',
        name: 'Image Storage',
        slug: 'image-storage',
        createdAt
      }
    ]);

    const response = await service.listProjects(ownerUserId);

    expect(projectDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerUserId },
        orderBy: { createdAt: 'asc' }
      })
    );
    expect(response).toHaveLength(1);
    expect(response[0]).toEqual({
      id: '937d53d7-13d5-4f3d-96e0-7e8fef3717ad',
      name: 'Image Storage',
      slug: 'image-storage',
      createdAt: createdAt.toISOString()
    });
  });

  it('rejects duplicate slug for the same owner', async () => {
    projectDelegate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    await expect(
      service.createProject(ownerUserId, {
        name: 'Image Storage'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects stale tokens whose owner no longer exists', async () => {
    userDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.createProject(ownerUserId, {
        name: 'Image Storage'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
