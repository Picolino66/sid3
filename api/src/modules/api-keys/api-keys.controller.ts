import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyCreatedResponseDto } from './dto/api-key-created-response.dto';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { CreateApiKeyRequestDto } from './dto/create-api-key-request.dto';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @ApiOkResponse({ type: ApiKeyResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  listApiKeys(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string
  ): Promise<ApiKeyResponseDto[]> {
    return this.apiKeysService.listApiKeys(user.id, projectId);
  }

  @Post()
  @ApiCreatedResponse({ type: ApiKeyCreatedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  createApiKey(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Body() request: CreateApiKeyRequestDto
  ): Promise<ApiKeyCreatedResponseDto> {
    return this.apiKeysService.createApiKey(user.id, projectId, request);
  }

  @Post(':apiKeyId/regenerate')
  @ApiCreatedResponse({ type: ApiKeyCreatedResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  regenerateApiKey(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Param('apiKeyId') apiKeyId: string
  ): Promise<ApiKeyCreatedResponseDto> {
    return this.apiKeysService.regenerateApiKey(user.id, projectId, apiKeyId);
  }

  @Delete(':apiKeyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Revoked' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  async revokeApiKey(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Param('apiKeyId') apiKeyId: string
  ): Promise<void> {
    await this.apiKeysService.revokeApiKey(user.id, projectId, apiKeyId);
  }
}
