import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { ConnectionStatsResponseDto } from './dto/connection-stats-response.dto';
import { ProjectStorageStatsResponseDto } from './dto/project-storage-stats-response.dto';
import { StatsService } from './stats.service';

@ApiTags('Stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('projects/:projectId/stats/storage')
  @ApiOkResponse({ type: ProjectStorageStatsResponseDto })
  @ApiUnauthorizedResponse()
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Atualizar cota contornando o cache' })
  getProjectStorageStats(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Query('force') force?: string
  ): Promise<ProjectStorageStatsResponseDto> {
    return this.statsService.getProjectStorageStats(user.id, projectId, force === 'true');
  }

  @Get('connections/:connectionId/stats')
  @ApiOkResponse({ type: ConnectionStatsResponseDto })
  @ApiNotFoundResponse()
  @ApiUnauthorizedResponse()
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Atualizar cota contornando o cache' })
  getConnectionStats(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId') connectionId: string,
    @Query('force') force?: string
  ): Promise<ConnectionStatsResponseDto> {
    return this.statsService.getConnectionStats(user.id, connectionId, force === 'true');
  }

  @Get('projects/:projectId/stats/connections')
  @ApiOkResponse({ type: ConnectionStatsResponseDto, isArray: true })
  @ApiUnauthorizedResponse()
  @ApiQuery({ name: 'force', required: false, type: Boolean, description: 'Atualizar cota contornando o cache' })
  getProjectConnectionsStats(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Query('force') force?: string
  ): Promise<ConnectionStatsResponseDto[]> {
    return this.statsService.getProjectConnectionsStats(user.id, projectId, force === 'true');
  }
}
