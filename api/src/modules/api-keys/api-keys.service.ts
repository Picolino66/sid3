import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeySecretService } from './api-key-secret.service';
import { ApiKeyCreatedResponseDto } from './dto/api-key-created-response.dto';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { CreateApiKeyRequestDto } from './dto/create-api-key-request.dto';

type PersistedApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiKeySecretService: ApiKeySecretService
  ) {}

  async listApiKeys(ownerUserId: string, projectId: string): Promise<ApiKeyResponseDto[]> {
    await this.ensureProjectOwner(ownerUserId, projectId);

    const apiKeys = await this.prisma.apiKey.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: this.apiKeySelect()
    });

    return apiKeys.map((apiKey) => this.toApiKeyResponse(apiKey));
  }

  async createApiKey(
    ownerUserId: string,
    projectId: string,
    request: CreateApiKeyRequestDto
  ): Promise<ApiKeyCreatedResponseDto> {
    await this.ensureProjectOwner(ownerUserId, projectId);

    const generatedApiKey = this.apiKeySecretService.generate();
    const apiKey = await this.prisma.apiKey.create({
      data: {
        projectId,
        name: request.name.trim(),
        prefix: generatedApiKey.prefix,
        secretHash: generatedApiKey.secretHash
      },
      select: this.apiKeySelect()
    });

    return {
      apiKey: this.toApiKeyResponse(apiKey),
      secret: generatedApiKey.secret
    };
  }

  async revokeApiKey(ownerUserId: string, projectId: string, apiKeyId: string): Promise<void> {
    await this.ensureProjectOwner(ownerUserId, projectId);

    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: apiKeyId,
        projectId
      },
      select: { id: true }
    });

    if (!apiKey) {
      throw new NotFoundException('Chave de API não encontrada');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { revokedAt: new Date() },
      select: { id: true }
    });
  }

  private async ensureProjectOwner(ownerUserId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        ownerUserId
      },
      select: { id: true }
    });

    if (!project) {
      throw new UnauthorizedException('Projeto não encontrado para o usuário atual');
    }
  }

  private toApiKeyResponse(apiKey: PersistedApiKey): ApiKeyResponseDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
      revokedAt: apiKey.revokedAt?.toISOString() ?? null,
      createdAt: apiKey.createdAt.toISOString()
    };
  }

  private apiKeySelect(): Prisma.ApiKeySelect {
    return {
      id: true,
      name: true,
      prefix: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true
    };
  }
}
