import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponseDto } from './dto/auth-response.dto';
import { LoginRequestDto } from './dto/login-request.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { PasswordService } from './password.service';

type PersistedUser = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: Date;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordService: PasswordService
  ) {}

  async register(request: RegisterRequestDto): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(request.email);
    const passwordHash = await this.passwordService.hashPassword(request.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name: request.name.trim()
        },
        select: this.userSelect()
      });

      return this.createAuthResponse(user);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Este e-mail já está cadastrado');
      }
      throw error;
    }
  }

  async login(request: LoginRequestDto): Promise<AuthResponseDto> {
    const email = this.normalizeEmail(request.email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: this.userSelect()
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const passwordMatches = await this.passwordService.verifyPassword(request.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return this.createAuthResponse(user);
  }

  async getCurrentUser(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.userSelect()
    });

    if (!user) {
      throw new UnauthorizedException('Token de autenticação inválido');
    }

    return this.toUserResponse(user);
  }

  private async createAuthResponse(user: PersistedUser): Promise<AuthResponseDto> {
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '1h'
      }
    );

    return {
      accessToken,
      user: this.toUserResponse(user)
    };
  }

  private toUserResponse(user: PersistedUser): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name ?? '',
      createdAt: user.createdAt.toISOString()
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private userSelect(): Prisma.UserSelect {
    return {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      createdAt: true
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
