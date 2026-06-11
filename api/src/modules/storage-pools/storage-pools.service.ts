import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { Prisma, ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddPoolMemberRequestDto } from './dto/add-pool-member-request.dto';
import { CreateStoragePoolRequestDto } from './dto/create-storage-pool-request.dto';
import { PoolMemberResponseDto } from './dto/pool-member-response.dto';
import { StoragePoolResponseDto } from './dto/storage-pool-response.dto';
import { UpdateStoragePoolRequestDto } from './dto/update-storage-pool-request.dto';

type RawMember = {
  id: string;
  providerIntegrationId: string;
  weight: number;
  createdAt: Date;
  providerIntegration: {
    provider: string;
    displayName: string | null;
    providerAccountEmail: string | null;
    status: string;
  };
};

const MEMBER_SELECT = {
  id: true,
  providerIntegrationId: true,
  weight: true,
  createdAt: true,
  providerIntegration: {
    select: {
      provider: true,
      displayName: true,
      providerAccountEmail: true,
      status: true
    }
  }
} as const;

@Injectable()
export class StoragePoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPools(ownerUserId: string, projectId: string): Promise<StoragePoolResponseDto[]> {
    await this.ensureProjectOwner(ownerUserId, projectId);

    const pools = await this.prisma.storagePool.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      select: this.poolSelect()
    });

    return pools.map((pool) => this.toPoolResponse(pool));
  }

  async createPool(
    ownerUserId: string,
    projectId: string,
    dto: CreateStoragePoolRequestDto
  ): Promise<StoragePoolResponseDto> {
    await this.ensureProjectOwner(ownerUserId, projectId);

    try {
      const pool = await this.prisma.storagePool.create({
        data: {
          projectId,
          name: dto.name.trim(),
          strategy: dto.strategy ?? 'ROUND_ROBIN'
        },
        select: this.poolSelect()
      });

      return this.toPoolResponse(pool);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um pool com este nome neste projeto');
      }
      throw error;
    }
  }

  async getPool(ownerUserId: string, poolId: string): Promise<StoragePoolResponseDto> {
    const pool = await this.findOwnedPool(ownerUserId, poolId);
    return this.toPoolResponse(pool);
  }

  async updatePool(
    ownerUserId: string,
    poolId: string,
    dto: UpdateStoragePoolRequestDto
  ): Promise<StoragePoolResponseDto> {
    await this.findOwnedPool(ownerUserId, poolId);

    const data: Prisma.StoragePoolUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.strategy !== undefined) data.strategy = dto.strategy;

    try {
      const updated = await this.prisma.storagePool.update({
        where: { id: poolId },
        data,
        select: this.poolSelect()
      });

      return this.toPoolResponse(updated);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um pool com este nome neste projeto');
      }
      throw error;
    }
  }

  async deletePool(ownerUserId: string, poolId: string): Promise<void> {
    await this.findOwnedPool(ownerUserId, poolId);

    try {
      await this.prisma.storagePool.delete({ where: { id: poolId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('O pool de armazenamento ainda está em uso por um ou mais buckets');
      }
      throw error;
    }
  }

  async addMember(
    ownerUserId: string,
    poolId: string,
    dto: AddPoolMemberRequestDto
  ): Promise<PoolMemberResponseDto> {
    await this.findOwnedPool(ownerUserId, poolId);

    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: dto.connectionId, userId: ownerUserId },
      select: { id: true, status: true }
    });

    if (!connection) {
      throw new UnauthorizedException('Conexão não encontrada para o usuário atual');
    }

    if (connection.status !== ProviderIntegrationStatus.CONNECTED) {
      throw new BadRequestException('A conexão não está ativa');
    }

    try {
      const member = await this.prisma.storagePoolMember.create({
        data: {
          poolId,
          providerIntegrationId: dto.connectionId,
          weight: dto.weight ?? 1
        },
        select: this.memberSelect()
      });

      return this.toMemberResponse(member);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Esta conexão já é membro deste pool');
      }
      throw error;
    }
  }

  async removeMember(ownerUserId: string, poolId: string, memberId: string): Promise<void> {
    await this.findOwnedPool(ownerUserId, poolId);

    const member = await this.prisma.storagePoolMember.findFirst({
      where: { id: memberId, poolId },
      select: { id: true }
    });

    if (!member) {
      throw new NotFoundException('Membro do pool não encontrado');
    }

    await this.prisma.storagePoolMember.delete({ where: { id: memberId } });
  }

  private async findOwnedPool(ownerUserId: string, poolId: string) {
    const pool = await this.prisma.storagePool.findFirst({
      where: {
        id: poolId,
        project: { ownerUserId }
      },
      select: this.poolSelect()
    });

    if (!pool) {
      throw new NotFoundException('Pool de armazenamento não encontrado');
    }

    return pool;
  }

  private async ensureProjectOwner(ownerUserId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerUserId },
      select: { id: true }
    });

    if (!project) {
      throw new UnauthorizedException('Projeto não encontrado para o usuário atual');
    }
  }

  private poolSelect() {
    return {
      id: true,
      projectId: true,
      name: true,
      strategy: true,
      createdAt: true,
      updatedAt: true,
      members: {
        orderBy: { createdAt: 'asc' as const },
        select: MEMBER_SELECT
      }
    };
  }

  private memberSelect() {
    return MEMBER_SELECT;
  }

  private toPoolResponse(pool: {
    id: string;
    projectId: string;
    name: string;
    strategy: string;
    createdAt: Date;
    updatedAt: Date;
    members: RawMember[];
  }): StoragePoolResponseDto {
    return {
      id: pool.id,
      projectId: pool.projectId,
      name: pool.name,
      strategy: pool.strategy as StoragePoolResponseDto['strategy'],
      members: pool.members.map((m) => this.toMemberResponse(m)),
      createdAt: pool.createdAt.toISOString(),
      updatedAt: pool.updatedAt.toISOString()
    };
  }

  private toMemberResponse(member: RawMember): PoolMemberResponseDto {
    return {
      id: member.id,
      connectionId: member.providerIntegrationId,
      provider: member.providerIntegration.provider as PoolMemberResponseDto['provider'],
      displayName: member.providerIntegration.displayName,
      providerAccountEmail: member.providerIntegration.providerAccountEmail,
      connectionStatus: member.providerIntegration.status as PoolMemberResponseDto['connectionStatus'],
      weight: member.weight,
      createdAt: member.createdAt.toISOString()
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
