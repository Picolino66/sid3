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
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentApiKey } from '../../common/auth/current-api-key.decorator';
import { ApiKeyAuthContext, ApiKeyAuthGuard } from '../../common/auth/api-key-auth.guard';
import { ObjectListResponseDto } from './dto/object-list-response.dto';
import { StorageObjectResponseDto } from './dto/storage-object-response.dto';
import { UploadObjectRequestDto } from './dto/upload-object-request.dto';
import { ObjectsService } from './objects.service';

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
    @Query('limit') limit?: string
  ): Promise<ObjectListResponseDto> {
    return this.objectsService.listObjects(apiKey, bucketId, { prefix, limit });
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
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
  @ApiUnauthorizedResponse({ description: 'Invalid or missing API key' })
  uploadObject(
    @CurrentApiKey() apiKey: ApiKeyAuthContext,
    @Param('bucketId') bucketId: string,
    @Body() request: UploadObjectRequestDto,
    @UploadedFile() file: Express.Multer.File
  ): Promise<StorageObjectResponseDto> {
    return this.objectsService.uploadObject(apiKey, bucketId, request, file);
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
    const download = await this.objectsService.downloadObject(apiKey, bucketId, objectId);
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
    await this.objectsService.deleteObject(apiKey, bucketId, objectId);
  }
}
