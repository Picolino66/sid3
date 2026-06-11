import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import { ProjectResponseDto } from './dto/project-response.dto';

type PersistedProject = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
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
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || 'project';
  }

  private toProjectResponse(project: PersistedProject): ProjectResponseDto {
    return {
      id: project.id,
      name: project.name,
      slug: project.slug,
      createdAt: project.createdAt.toISOString()
    };
  }

  private projectSelect(): Prisma.ProjectSelect {
    return {
      id: true,
      name: true,
      slug: true,
      createdAt: true
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }
}
