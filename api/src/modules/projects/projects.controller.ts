import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import { LinkProjectConnectionRequestDto } from './dto/link-project-connection-request.dto';
import { ProjectConnectionResponseDto } from './dto/project-connection-response.dto';
import { ProjectOverviewResponseDto } from './dto/project-overview-response.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectRequestDto } from './dto/update-project-request.dto';
import { ProjectConnectionsService } from './project-connections.service';
import { ProjectOverviewService } from './project-overview.service';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectConnectionsService: ProjectConnectionsService,
    private readonly projectOverviewService: ProjectOverviewService
  ) {}

  @Get()
  @ApiOkResponse({ type: ProjectResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  listProjects(@CurrentUserContext() user: CurrentUser): Promise<ProjectResponseDto[]> {
    return this.projectsService.listProjects(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  createProject(
    @CurrentUserContext() user: CurrentUser,
    @Body() request: CreateProjectRequestDto
  ): Promise<ProjectResponseDto> {
    return this.projectsService.createProject(user.id, request);
  }

  @Patch(':projectId')
  @ApiOkResponse({ type: ProjectResponseDto })
  updateProject(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() request: UpdateProjectRequestDto
  ): Promise<ProjectResponseDto> {
    return this.projectsService.updateProject(user.id, projectId, request);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Projeto excluído' })
  @ApiConflictResponse({ description: 'O projeto ainda tem arquivos' })
  deleteProject(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string
  ): Promise<void> {
    return this.projectsService.deleteProject(user.id, projectId);
  }

  @Get(':projectId/overview')
  @ApiOkResponse({ type: ProjectOverviewResponseDto })
  getOverview(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string
  ): Promise<ProjectOverviewResponseDto> {
    return this.projectOverviewService.getOverview(user.id, projectId);
  }

  @Get(':projectId/connections')
  @ApiOkResponse({ type: ProjectConnectionResponseDto, isArray: true })
  listProjectConnections(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string
  ): Promise<ProjectConnectionResponseDto[]> {
    return this.projectConnectionsService.listProjectConnections(user.id, projectId);
  }

  @Post(':projectId/connections')
  @ApiCreatedResponse({ type: ProjectConnectionResponseDto })
  @ApiConflictResponse({ description: 'A conexão já está no projeto' })
  linkConnection(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() request: LinkProjectConnectionRequestDto
  ): Promise<ProjectConnectionResponseDto> {
    return this.projectConnectionsService.linkConnection(user.id, projectId, request.connectionId);
  }

  @Delete(':projectId/connections/:connectionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Conexão removida do projeto (a conexão continua existindo)' })
  @ApiConflictResponse({ description: 'A conexão ainda é usada por buckets, pools ou arquivos do projeto' })
  unlinkConnection(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string
  ): Promise<void> {
    return this.projectConnectionsService.unlinkConnection(user.id, projectId, connectionId);
  }
}
