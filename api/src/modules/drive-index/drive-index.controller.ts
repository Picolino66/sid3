import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse
} from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { buildAttachmentDisposition } from '../../common/http/content-disposition';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { DriveFilesService } from './drive-files.service';
import { DriveFolderZipService } from './drive-folder-zip.service';
import { DriveIndexSyncService } from './drive-index-sync.service';
import { DriveFileListResponseDto } from './dto/drive-file-list-response.dto';
import { DriveFileResponseDto } from './dto/drive-file-response.dto';
import { DriveIndexStatusResponseDto } from './dto/drive-index-status-response.dto';
import { ListDriveFilesQueryDto } from './dto/list-drive-files-query.dto';
import { RefreshDriveIndexRequestDto } from './dto/refresh-drive-index-request.dto';
import { streamZipResponse } from './zip-response';

@ApiTags('Drive Index')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
@ApiNotFoundResponse({ description: 'Connection or file not found' })
@Controller('connections/:connectionId')
export class DriveIndexController {
  private readonly logger = new Logger(DriveIndexController.name);

  constructor(
    private readonly driveIndexSyncService: DriveIndexSyncService,
    private readonly driveFilesService: DriveFilesService,
    private readonly folderZipService: DriveFolderZipService
  ) {}

  @Get('drive-index')
  @ApiOkResponse({ type: DriveIndexStatusResponseDto })
  getIndexStatus(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId', ParseUUIDPipe) connectionId: string
  ): Promise<DriveIndexStatusResponseDto> {
    return this.driveIndexSyncService.getStatus(user.id, connectionId);
  }

  @Post('drive-index/refresh')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiAcceptedResponse({
    type: DriveIndexStatusResponseDto,
    description: 'Atualização agendada (ou já em andamento). Consulte GET drive-index até o status sair de INDEXING.'
  })
  @ApiForbiddenResponse({ description: 'Connection lacks the drive.readonly scope; reauthorize it' })
  @ApiConflictResponse({ description: 'Connection is not active' })
  refreshIndex(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: RefreshDriveIndexRequestDto
  ): Promise<DriveIndexStatusResponseDto> {
    return this.driveIndexSyncService.requestRefresh(user.id, connectionId, dto.mode);
  }

  @Get('drive-files')
  @ApiOkResponse({ type: DriveFileListResponseDto })
  listFiles(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Query() query: ListDriveFilesQueryDto
  ): Promise<DriveFileListResponseDto> {
    return this.driveFilesService.listFiles(user.id, connectionId, query);
  }

  @Get('drive-files/:fileId')
  @ApiOkResponse({ type: DriveFileResponseDto })
  getFile(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('fileId') fileId: string
  ): Promise<DriveFileResponseDto> {
    return this.driveFilesService.getFile(user.id, connectionId, fileId);
  }

  @Get('drive-files/:fileId/download-zip')
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP da pasta com subpastas, gerado em streaming' })
  @ApiForbiddenResponse({ description: 'Connection lacks the drive.readonly scope; reauthorize it' })
  @ApiConflictResponse({ description: 'Connection is not active' })
  @ApiUnprocessableEntityResponse({ description: 'Item is not a folder' })
  @ApiPayloadTooLargeResponse({ description: 'Folder exceeds the ZIP file count or size limit' })
  async downloadFolderZip(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('fileId') fileId: string,
    @Res() response: Response
  ): Promise<void> {
    const zip = await this.driveFilesService.prepareFolderZip(user.id, connectionId, fileId);
    await streamZipResponse(response, this.folderZipService, zip);
  }

  @Get('drive-files/:fileId/download')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'Conteúdo do arquivo. Docs/Planilhas/Apresentações são exportados para Office.' })
  @ApiForbiddenResponse({ description: 'Connection lacks the drive.readonly scope; reauthorize it' })
  @ApiConflictResponse({ description: 'Connection is not active' })
  @ApiUnprocessableEntityResponse({ description: 'Item is a folder or a Google type that cannot be downloaded' })
  async downloadFile(
    @CurrentUserContext() user: CurrentUser,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Param('fileId') fileId: string,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.driveFilesService.downloadFile(user.id, connectionId, fileId);

    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Disposition', buildAttachmentDisposition(content.fileName));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (content.sizeBytes !== null) {
      response.setHeader('Content-Length', String(content.sizeBytes));
    }

    try {
      await pipeline(content.stream, response);
    } catch (error) {
      this.logger.warn(`Drive file stream interrupted: ${error instanceof Error ? error.message : 'unknown_error'}`);
      response.destroy();
    }
  }
}
