import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeySecretService } from './api-key-secret.service';
import { ApiKeysService } from './api-keys.service';

type ProjectDelegateMock = {
  findFirst: jest.Mock;
};

type ApiKeyDelegateMock = {
  create: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  update: jest.Mock;
};

describe(ApiKeysService.name, () => {
  const ownerUserId = '90b80580-208a-455d-bd22-b44fc9582250';
  const projectId = '3a733ccf-d1b8-4985-a4c8-3be17814989b';
  const apiKeyId = '8f86ea48-ff89-43bb-96cc-9e9ec4a2512d';
  const createdAt = new Date('2026-05-24T13:20:00.000Z');
  const persistedApiKey = {
    id: apiKeyId,
    name: 'Production integration',
    prefix: '4f6a8c2b9e10',
    lastUsedAt: null,
    revokedAt: null,
    createdAt
  };

  let projectDelegate: ProjectDelegateMock;
  let apiKeyDelegate: ApiKeyDelegateMock;
  let apiKeySecretService: jest.Mocked<Pick<ApiKeySecretService, 'generate' | 'hash' | 'extractPrefix'>>;
  let service: ApiKeysService;

  beforeEach(() => {
    projectDelegate = {
      findFirst: jest.fn().mockResolvedValue({ id: projectId })
    };
    apiKeyDelegate = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    };
    apiKeySecretService = {
      generate: jest.fn().mockReturnValue({
        prefix: '4f6a8c2b9e10',
        secret: 'test-secret',
        secretHash: 'hashed-secret'
      }),
      hash: jest.fn(),
      extractPrefix: jest.fn()
    };

    const prisma = {
      project: projectDelegate,
      apiKey: apiKeyDelegate
    } as unknown as PrismaService;

    service = new ApiKeysService(prisma, apiKeySecretService as unknown as ApiKeySecretService);
  });

  it('creates an API key for an owned project and returns the secret once', async () => {
    apiKeyDelegate.create.mockResolvedValue(persistedApiKey);

    const response = await service.createApiKey(ownerUserId, projectId, {
      name: ' Production integration '
    });

    expect(projectDelegate.findFirst).toHaveBeenCalledWith({
      where: { id: projectId, ownerUserId },
      select: { id: true }
    });
    expect(apiKeyDelegate.create).toHaveBeenCalledWith({
      data: {
        projectId,
        name: 'Production integration',
        prefix: '4f6a8c2b9e10',
        secretHash: 'hashed-secret'
      },
      select: expect.any(Object)
    });
    expect(response).toEqual({
      apiKey: {
        id: apiKeyId,
        name: 'Production integration',
        prefix: '4f6a8c2b9e10',
        lastUsedAt: null,
        revokedAt: null,
        createdAt: createdAt.toISOString()
      },
      secret: 'test-secret'
    });
  });

  it('lists API keys for an owned project without secrets', async () => {
    apiKeyDelegate.findMany.mockResolvedValue([persistedApiKey]);

    const response = await service.listApiKeys(ownerUserId, projectId);

    expect(apiKeyDelegate.findMany).toHaveBeenCalledWith({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: expect.any(Object)
    });
    expect(response).toEqual([
      {
        id: apiKeyId,
        name: 'Production integration',
        prefix: '4f6a8c2b9e10',
        lastUsedAt: null,
        revokedAt: null,
        createdAt: createdAt.toISOString()
      }
    ]);
    expect(JSON.stringify(response)).not.toContain('secret');
  });

  it('revokes an API key for an owned project', async () => {
    apiKeyDelegate.findFirst.mockResolvedValue({ id: apiKeyId });
    apiKeyDelegate.update.mockResolvedValue({ id: apiKeyId });

    await service.revokeApiKey(ownerUserId, projectId, apiKeyId);

    expect(apiKeyDelegate.update).toHaveBeenCalledWith({
      where: { id: apiKeyId },
      data: { revokedAt: expect.any(Date) },
      select: { id: true }
    });
  });

  it('rejects API key access when project is not owned by current user', async () => {
    projectDelegate.findFirst.mockResolvedValue(null);

    await expect(service.listApiKeys(ownerUserId, projectId)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects revoke when API key does not belong to the project', async () => {
    apiKeyDelegate.findFirst.mockResolvedValue(null);

    await expect(service.revokeApiKey(ownerUserId, projectId, apiKeyId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
