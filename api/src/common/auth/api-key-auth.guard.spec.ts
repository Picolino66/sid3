import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeySecretService } from '../../modules/api-keys/api-key-secret.service';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { ApiKeyAuthGuard, ApiKeyAuthenticatedRequest } from './api-key-auth.guard';

describe(ApiKeyAuthGuard.name, () => {
  let request: ApiKeyAuthenticatedRequest;
  let prisma: { apiKey: { findFirst: jest.Mock; update: jest.Mock } };
  let guard: ApiKeyAuthGuard;

  beforeEach(() => {
    request = {
      header: jest.fn().mockReturnValue('sid3_live_abcdef123456_secret')
    } as unknown as ApiKeyAuthenticatedRequest;
    prisma = {
      apiKey: {
        findFirst: jest.fn(),
        update: jest.fn()
      }
    };
    const apiKeySecretService = {
      extractPrefix: jest.fn().mockReturnValue('abcdef123456'),
      hash: jest.fn().mockReturnValue('hashed-secret')
    } as unknown as ApiKeySecretService;
    guard = new ApiKeyAuthGuard(prisma as unknown as PrismaService, apiKeySecretService);
  });

  it('authenticates an active API key and stores context on the request', async () => {
    prisma.apiKey.findFirst.mockResolvedValue({
      id: 'api-key-id',
      projectId: 'project-id'
    });
    prisma.apiKey.update.mockResolvedValue({ id: 'api-key-id' });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
      where: {
        prefix: 'abcdef123456',
        secretHash: 'hashed-secret',
        revokedAt: null
      },
      select: {
        id: true,
        projectId: true
      }
    });
    expect(request.apiKeyAuth).toEqual({
      apiKeyId: 'api-key-id',
      projectId: 'project-id'
    });
  });

  it('rejects invalid API keys', async () => {
    prisma.apiKey.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects requests without an API key header', async () => {
    request.header = jest.fn().mockReturnValue(undefined);

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createContext(request: ApiKeyAuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}
