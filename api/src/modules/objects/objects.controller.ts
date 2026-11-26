import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentApiKey } from '../../common/auth/current-api-key.decorator';
import { ApiKeyAuthContext, ApiKeyAuthGuard } from '../../common/auth/api-key-auth.guard';
import { ObjectListResponseDto } from './dto/object-list-response.dto';
import { SignedDownloadUrlResponseDto } from './dto/signed-download-url-response.dto';
import { StorageObjectResponseDto } from './dto/storage-object-response.dto';
import { UploadObjectRequestDto } from './dto/upload-object-request.dto';
import { ObjectAccessContext, ObjectsService } from './objects.service';
import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';
import { UploadProblemDetailsFilter } from './upload-problem-details.filter';

@ApiTags('Objects')
@ApiSecurity('apiKeyAuth')
@UseGuards(ApiKeyAuthGuard)
@Controller('buckets/:bucketId/objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Get()
  @ApiOkResponse({ type: ObjectListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing API key' })
  listObjects(
    @CurrentApiKey() apiKey: ApiKeyAuthContext,
    @Param('bucketId') bucketId: string,
    @Query('prefix') prefix?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('delimiter') delimiter?: string
  ): Promise<ObjectListResponseDto> {
    return this.objectsService.listObjects(toAccess(apiKey), bucketId, { prefix, limit, cursor, delimiter });
  }

  @Post()
  @UseInterceptors(UploadCleanupInterceptor, FileInterceptor('file'))
  @UseFilters(UploadProblemDetailsFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['key', 'file'],
      properties: {
        key: { type: 'string' },
        file: { type: 'string', format: 'binary' }
      }
    }
  })
  @ApiCreatedResponse({ type: StorageObjectResponseDto })
  @ApiResponse({
    status: 413,
    description: 'Arquivo excede o limite configurado',
    content: {
      'application/problem+json': {
        schema: {
          type: 'object',
          required: ['type', 'title', 'status', 'detail'],
          properties: {
            type: { type: 'string', format: 'uri' },
            title: { type: 'string' },
            status: { type: 'integer', example: 413 },
            detail: { type: 'string' }
          }
        }
      }
    }
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing API key' })
  uploadObject(
    @CurrentApiKey() apiKey: ApiKeyAuthContext,
    @Param('bucketId') bucketId: string,
    @Body() request: UploadObjectRequestDto,
    @UploadedFile() file: Express.Multer.File
  ): Promise<StorageObjectResponseDto> {
    return this.objectsService.uploadObject(toAccess(apiKey), bucketId, request, file);
  }

  @Get(':objectId/download')
  @ApiOkResponse({ description: 'File bytes' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing API key' })
  async downloadObject(
    @CurrentApiKey() apiKey: ApiKeyAuthContext,
    @Param('bucketId') bucketId: string,
    @Param('objectId') objectId: string,
    @Res() response: Response
  ): Promise<void> {
    const download = await this.objectsService.downloadObject(toAccess(apiKey), bucketId, objectId);
    response.setHeader('Content-Type', download.contentType ?? 'application/octet-stream');
    if (download.fileName) {
      response.setHeader('Content-Disposition', `attachment; filename="${download.fileName}"`);
    }
    if (download.sizeBytes !== null) {
      response.setHeader('Content-Length', String(download.sizeBytes));
    }
    download.stream.pipe(response);
  }

  @Delete(':objectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing API key' })
  async deleteObject(
    @CurrentApiKey() apiKey: ApiKeyAuthContext,
    @Param('bucketId') bucketId: string,
    @Param('objectId') objectId: string
  ): Promise<void> {
    await this.objectsService.deleteObject(toAccess(apiKey), bucketId, objectId);
  }

  @Post(':objectId/sign-download')
  @ApiOkResponse({ type: SignedDownloadUrlResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing API key' })
  signDownloadUrl(
    @CurrentApiKey() apiKey: ApiKeyAuthContext,
    @Param('bucketId') bucketId: string,
    @Param('objectId') objectId: string,
    @Query('expiresIn') expiresIn?: string
  ): Promise<SignedDownloadUrlResponseDto> {
    const parsedExpiresIn = expiresIn ? parseInt(expiresIn, 10) : undefined;
    return this.objectsService.signDownloadUrl(toAccess(apiKey), bucketId, objectId, parsedExpiresIn);
  }
}

/** URLs assinadas não têm chave de API real: registram a operação sem apiKeyId. */
function toAccess(apiKey: ApiKeyAuthContext): ObjectAccessContext {
  return {
    projectId: apiKey.projectId,
    apiKeyId: apiKey.apiKeyId === 'signed-url' ? null : apiKey.apiKeyId
  };
}
