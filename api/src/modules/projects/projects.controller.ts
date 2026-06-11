import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { CreateProjectRequestDto } from './dto/create-project-request.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
}
