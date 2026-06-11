import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { OAuthAuthorizeResponseDto } from './dto/oauth-authorize-response.dto';
import { OAuthCallbackRequestDto } from './dto/oauth-callback-request.dto';
import { UpdateConnectionRequestDto } from './dto/update-connection-request.dto';
import { ConnectionsService } from './connections.service';

@ApiTags('Connections')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connectionsService: ConnectionsService) {}

  @Post('google/authorize')
  @ApiOkResponse({ type: OAuthAuthorizeResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  createGoogleAuthorizationUrl(@CurrentUserContext() user: CurrentUser): Promise<OAuthAuthorizeResponseDto> {
    return this.connectionsService.createGoogleAuthorizationUrl(user.id);
  }

  @Post('google/callback')
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  completeGoogleConnection(
    @CurrentUserContext() user: CurrentUser,
    @Body() request: OAuthCallbackRequestDto
  ): Promise<ConnectionResponseDto> {
    return this.connectionsService.completeGoogleConnection(user.id, request);
  }

  @Get()
  @ApiOkResponse({ type: ConnectionResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  listConnections(@CurrentUserContext() user: CurrentUser): Promise<ConnectionResponseDto[]> {
    return this.connectionsService.listConnections(user.id);
  }

  @Patch(':connectionId')
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  updateConnection(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId') connectionId: string,
    @Body() dto: UpdateConnectionRequestDto
  ): Promise<ConnectionResponseDto> {
    return this.connectionsService.updateConnection(user.id, connectionId, dto);
  }

  @Post(':connectionId/revoke')
  @ApiOkResponse({ type: ConnectionResponseDto })
  @ApiNotFoundResponse({ description: 'Connection not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  revokeConnection(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId') connectionId: string
  ): Promise<ConnectionResponseDto> {
    return this.connectionsService.revokeConnection(user.id, connectionId);
  }
}
