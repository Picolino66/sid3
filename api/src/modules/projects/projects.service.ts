import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, StorageObjectStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectRequestDto } from './dto/update-project-request.dto';

type PersistedProject = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  _count: { connections: number; buckets: number };
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async listProjects(ownerUserId: string): Promise<ProjectResponseDto[]> {
    await this.ensureOwnerExists(ownerUserId);

    const projects = await this.prisma.project.findMany({
      where: { ownerUserId },
      orderBy: { createdAt: 'asc' },
      select: this.projectSelect()
    });

    return projects.map((project) => this.toProjectResponse(project));
  }

  async createProject(ownerUserId: string, request: CreateProjectRequestDto): Promise<ProjectResponseDto> {
    await this.ensureOwnerExists(ownerUserId);

    try {
      const project = await this.prisma.project.create({
        data: {
          ownerUserId,
          name: request.name.trim(),
          slug: this.createSlug(request.name)
        },
        select: this.projectSelect()
      });

      return this.toProjectResponse(project);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um projeto com este slug para o usuário');
      }
      throw error;
    }
  }

  async updateProject(
    ownerUserId: string,
    projectId: string,
    request: UpdateProjectRequestDto
  ): Promise<ProjectResponseDto> {
    await this.findOwnedProject(ownerUserId, projectId);

    try {
      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: { name: request.name.trim(), slug: this.createSlug(request.name) },
        select: this.projectSelect()
      });
      return this.toProjectResponse(project);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um projeto com este nome');
      }
      throw error;
    }
  }

  /**
   * Exclui o projeto e tudo que é só dele (buckets, chaves, pools, vínculos). Bloqueado enquanto houver
   * arquivos registrados, para não perder a referência de arquivos que continuam no Drive.
   */
  async deleteProject(ownerUserId: string, projectId: string): Promise<void> {
    await this.findOwnedProject(ownerUserId, projectId);

    const liveObjects = await this.prisma.storageObject.count({
      where: { projectId, deletedAt: null, status: { not: StorageObjectStatus.DELETED } }
    });

    if (liveObjects > 0) {
      throw new ConflictException(
        `O projeto ainda tem ${liveObjects} arquivo(s). Exclua os arquivos (ou os buckets vazios) antes de excluir o projeto.`
      );
    }

    await this.prisma.project.delete({ where: { id: projectId } });
  }

  async findOwnedProject(ownerUserId: string, projectId: string): Promise<{ id: string; name: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerUserId },
      select: { id: true, name: true }
    });

    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    return project;
  }

  private async ensureOwnerExists(ownerUserId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true }
    });

    if (!user) {
      throw new UnauthorizedException('Token de autenticação inválido');
    }
  }

  private createSlug(name: string): string {
    const slug = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'project';
  }

  private toProjectResponse(project: PersistedProject): ProjectResponseDto {
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      connectionCount: project._count?.connections ?? 0,
      bucketCount: project._count?.buckets ?? 0,
      createdAt: project.createdAt.toISOString()
    };
  }

  private projectSelect() {
    return {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      _count: { select: { connections: true, buckets: true } }
    } satisfies Prisma.ProjectSelect;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
