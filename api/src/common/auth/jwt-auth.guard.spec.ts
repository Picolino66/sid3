import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthenticatedRequest } from './types';
import { JwtAuthGuard } from './jwt-auth.guard';

describe(JwtAuthGuard.name, () => {
  let request: AuthenticatedRequest;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    request = {
      headers: {
        authorization: 'Bearer valid-token'
      }
    } as AuthenticatedRequest;
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-id',
        email: 'user@example.com'
      })
    };
    configService = {
      getOrThrow: jest.fn().mockReturnValue('jwt-secret')
    };
    guard = new JwtAuthGuard(jwtService as unknown as JwtService, configService as unknown as ConfigService);
  });

  it('authenticates a valid bearer token and stores current user on request', async () => {
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: 'jwt-secret'
    });
    expect(request.user).toEqual({
      id: 'user-id',
      email: 'user@example.com'
    });
  });

  it('rejects missing bearer token', async () => {
    request.headers.authorization = undefined;

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects malformed bearer token', async () => {
    request.headers.authorization = 'Token valid-token';

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects invalid bearer token', async () => {
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}
