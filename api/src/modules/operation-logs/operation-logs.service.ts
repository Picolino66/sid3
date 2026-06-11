import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { OperationStatus, OperationType, Prisma, Provider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OperationLogResponseDto } from './dto/operation-log-response.dto';

type ListLogsQuery = {
  limit?: string;
};

type PersistedOperationLog = {
  id: string;
  projectId: string;
  apiKeyId: string | null;
  bucketId: string | null;
  objectId: string | null;
  operation: OperationType;
  status: OperationStatus;
  provider: Provider | null;
  errorCode: string | null;
  requestId: string;
  createdAt: Date;
};

@Injectable()
export class OperationLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async listLogs(ownerUserId: string, projectId: string, query: ListLogsQuery): Promise<OperationLogResponseDto[]> {
    await this.ensureProjectOwner(ownerUserId, projectId);
    const limit = this.parseLimit(query.limit);

    const logs = await this.prisma.operationLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: this.operationLogSelect()
    });

    return logs.map((log) => this.toResponse(log));
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

  private parseLimit(limit: string | undefined): number {
    if (!limit) {
      return 50;
    }

    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('O limite deve ser um inteiro entre 1 e 100');
    }

    return parsedLimit;
  }

  private toResponse(log: PersistedOperationLog): OperationLogResponseDto {
    return {
      id: log.id,
      projectId: log.projectId,
      apiKeyId: log.apiKeyId,
      bucketId: log.bucketId,
      objectId: log.objectId,
      operation: log.operation,
      status: log.status,
      provider: log.provider,
      errorCode: log.errorCode,
      requestId: log.requestId,
      createdAt: log.createdAt.toISOString()
    };
  }

  private operationLogSelect(): Prisma.OperationLogSelect {
    return {
      id: true,
      projectId: true,
      apiKeyId: true,
      bucketId: true,
      objectId: true,
      operation: true,
      status: true,
      provider: true,
      errorCode: true,
      requestId: true,
      createdAt: true
    };
  }
}
