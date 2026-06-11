import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { OperationLogResponseDto } from './dto/operation-log-response.dto';
import { OperationLogsService } from './operation-logs.service';

@ApiTags('Operation Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/logs')
export class OperationLogsController {
  constructor(private readonly operationLogsService: OperationLogsService) {}

  @Get()
  @ApiOkResponse({ type: OperationLogResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  listLogs(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Query('limit') limit?: string
  ): Promise<OperationLogResponseDto[]> {
    return this.operationLogsService.listLogs(user.id, projectId, { limit });
  }
}
