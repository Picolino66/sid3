import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

type UserDelegateMock = {
  create: jest.Mock;
  findUnique: jest.Mock;
};

describe(AuthService.name, () => {
  const persistedUser = {
    id: '2a496928-5b1e-4c75-82e9-4429a9f5f855',
    email: 'dev@example.com',
    name: 'Dev User',
    passwordHash: 'hashed-password',
    createdAt: new Date('2026-05-24T12:00:00.000Z')
  };

  let userDelegate: UserDelegateMock;
  let service: AuthService;
  let passwordService: jest.Mocked<Pick<PasswordService, 'hashPassword' | 'verifyPassword'>>;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;

  beforeEach(() => {
    userDelegate = {
      create: jest.fn(),
      findUnique: jest.fn()
    };
    passwordService = {
      hashPassword: jest.fn(),
      verifyPassword: jest.fn()
    };
    jwtService = {
      signAsync: jest.fn()
    };

    const prisma = {
      user: userDelegate
    } as unknown as PrismaService;

    const configService = {
      getOrThrow: jest.fn().mockReturnValue('test-jwt-secret')
    } as unknown as ConfigService;

    service = new AuthService(
      prisma,
      jwtService as unknown as JwtService,
      configService,
      passwordService as unknown as PasswordService
    );
  });

  it('registers a user with normalized email and hashed password', async () => {
    passwordService.hashPassword.mockResolvedValue('hashed-password');
    jwtService.signAsync.mockResolvedValue('signed-token');
    userDelegate.create.mockResolvedValue(persistedUser);

    const response = await service.register({
      email: ' DEV@example.com ',
      password: 'test-password',
      name: ' Dev User '
    });

    expect(passwordService.hashPassword).toHaveBeenCalledWith('test-password');
    expect(userDelegate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'dev@example.com',
          passwordHash: 'hashed-password',
          name: 'Dev User'
        })
      })
    );
    expect(response).toEqual({
      accessToken: 'signed-token',
      user: {
        id: persistedUser.id,
        email: persistedUser.email,
        name: persistedUser.name,
        createdAt: persistedUser.createdAt.toISOString()
      }
    });
    expect(JSON.stringify(response)).not.toContain('passwordHash');
  });

  it('rejects duplicate email registration', async () => {
    passwordService.hashPassword.mockResolvedValue('hashed-password');
    userDelegate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );

    await expect(
      service.register({
        email: 'dev@example.com',
        password: 'test-password',
        name: 'Dev User'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in a user with valid credentials', async () => {
    userDelegate.findUnique.mockResolvedValue(persistedUser);
    passwordService.verifyPassword.mockResolvedValue(true);
    jwtService.signAsync.mockResolvedValue('signed-token');

    const response = await service.login({
      email: 'DEV@example.com',
      password: 'test-password'
    });

    expect(userDelegate.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: 'dev@example.com' }
      })
    );
    expect(passwordService.verifyPassword).toHaveBeenCalledWith('test-password', 'hashed-password');
    expect(response.accessToken).toBe('signed-token');
  });

  it('rejects login when credentials are invalid', async () => {
    userDelegate.findUnique.mockResolvedValue(persistedUser);
    passwordService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login({
        email: 'dev@example.com',
        password: 'wrong-password'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login when user is not found', async () => {
    userDelegate.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'dev@example.com',
        password: 'wrong-password'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the current authenticated user', async () => {
    userDelegate.findUnique.mockResolvedValue(persistedUser);

    const response = await service.getCurrentUser(persistedUser.id);

    expect(response).toEqual({
      id: persistedUser.id,
      email: persistedUser.email,
      name: persistedUser.name,
      createdAt: persistedUser.createdAt.toISOString()
    });
  });

  it('rejects current user lookup when token user no longer exists', async () => {
    userDelegate.findUnique.mockResolvedValue(null);

    await expect(service.getCurrentUser(persistedUser.id)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
