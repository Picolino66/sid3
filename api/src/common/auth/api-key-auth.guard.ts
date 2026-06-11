import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeySecretService } from '../../modules/api-keys/api-key-secret.service';
import { PrismaService } from '../../modules/prisma/prisma.service';

export type ApiKeyAuthContext = {
  apiKeyId: string;
  projectId: string;
};

export type ApiKeyAuthenticatedRequest = Request & {
  apiKeyAuth: ApiKeyAuthContext;
};

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeySecretService: ApiKeySecretService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiKeyAuthenticatedRequest>();
    const secret = this.extractApiKey(request);
    const prefix = this.apiKeySecretService.extractPrefix(secret);

    if (!prefix) {
      throw new UnauthorizedException('Invalid API key');
    }

    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        prefix,
        secretHash: this.apiKeySecretService.hash(secret),
        revokedAt: null
      },
      select: {
        id: true,
        projectId: true
      }
    });

    if (!apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
      select: { id: true }
    });

    request.apiKeyAuth = {
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId
    };

    return true;
  }

  private extractApiKey(request: Request): string {
    const apiKey = request.header('X-SID3-API-Key');

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    return apiKey;
  }
}
