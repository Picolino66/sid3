import { Controller, Get, Headers, HttpStatus, Logger, Param, Query, Res } from '@nestjs/common';
import {
  ApiGoneResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse
} from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import { buildAttachmentDisposition, buildInlineDisposition } from '../../common/http/content-disposition';
import { DriveFolderZipService } from '../drive-index/drive-folder-zip.service';
import { streamZipResponse } from '../drive-index/zip-response';
import { ListPublicFolderQueryDto } from './dto/list-public-folder-query.dto';
import {
  PublicFolderListResponseDto,
  PublicSearchResponseDto,
  PublicShareResponseDto
} from './dto/public-share-response.dto';
import { SearchPublicShareQueryDto } from './dto/search-public-share-query.dto';
import { PublicSharesService } from './public-shares.service';

/** Rotas SEM autenticação: o token do link é a credencial. */
@ApiTags('Public Shares')
@ApiNotFoundResponse({ description: 'Link not found, or item is not part of the link' })
@ApiGoneResponse({ description: 'Link revoked or expired' })
@ApiServiceUnavailableResponse({ description: 'Owner connection is revoked or lacks read access' })
@Controller('public/shares/:token')
export class PublicSharesController {
  private readonly logger = new Logger(PublicSharesController.name);

  constructor(
    private readonly publicSharesService: PublicSharesService,
    private readonly folderZipService: DriveFolderZipService
  ) {}

  @Get()
  @ApiOkResponse({ type: PublicShareResponseDto })
  getShare(@Param('token') token: string, @Res({ passthrough: true }) response: Response): Promise<PublicShareResponseDto> {
    this.setPrivacyHeaders(response);
    return this.publicSharesService.getShare(token);
  }

  @Get('folders/:folderId')
  @ApiOkResponse({ type: PublicFolderListResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'Item is not a folder' })
  listFolder(
    @Param('token') token: string,
    @Param('folderId') folderId: string,
    @Query() query: ListPublicFolderQueryDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<PublicFolderListResponseDto> {
    this.setPrivacyHeaders(response);
    return this.publicSharesService.listFolder(token, folderId, query.page);
  }

  @Get('search')
  @ApiOkResponse({ type: PublicSearchResponseDto, description: 'Itens do link (e de suas pastas) cujo nome contém o termo' })
  search(
    @Param('token') token: string,
    @Query() query: SearchPublicShareQueryDto,
    @Res({ passthrough: true }) response: Response
  ): Promise<PublicSearchResponseDto> {
    this.setPrivacyHeaders(response);
    return this.publicSharesService.search(token, query.q, query.page);
  }

  @Get('files/:fileId/content')
  @ApiProduces('image/*', 'video/*', 'audio/*')
  @ApiHeader({ name: 'Range', required: false, description: 'Intervalo de bytes (ex.: bytes=0-), usado pelo player de vídeo' })
  @ApiOkResponse({ description: 'Imagem, vídeo ou áudio para exibir no navegador (inline)' })
  @ApiResponse({ status: 206, description: 'Parte do arquivo pedida no header Range' })
  @ApiResponse({ status: 416, description: 'Intervalo fora do tamanho do arquivo' })
  @ApiUnprocessableEntityResponse({ description: 'Item is not an image, video or audio' })
  async streamMedia(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response
  ): Promise<void> {
    const result = await this.publicSharesService.streamMedia(token, fileId, range);

    this.setPrivacyHeaders(response);
    response.setHeader('Accept-Ranges', 'bytes');
    if (result.kind === 'unsatisfiable') {
      response.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).setHeader('Content-Range', `bytes */${result.sizeBytes}`);
      response.end();
      return;
    }

    const { content } = result;
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Disposition', buildInlineDisposition(content.fileName));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Mídia nunca precisa de scripts: se o arquivo não for o que diz ser, o navegador não executa nada.
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    if (content.partial) {
      response.status(HttpStatus.PARTIAL_CONTENT).setHeader('Content-Range', content.partial.contentRange);
      if (content.partial.contentLength !== null) {
        response.setHeader('Content-Length', String(content.partial.contentLength));
      }
    } else if (content.sizeBytes !== null) {
      response.setHeader('Content-Length', String(content.sizeBytes));
    }

    try {
      await pipeline(content.stream, response);
    } catch {
      // O player cancela requisições ao avançar ou fechar; não é erro.
      response.destroy();
    }
  }

  @Get('download-zip')
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP com todos os itens do link' })
  @ApiPayloadTooLargeResponse({ description: 'Items exceed the ZIP file count or size limit' })
  async downloadShareZip(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const zip = await this.publicSharesService.prepareShareZip(token);
    this.setPrivacyHeaders(response);
    await streamZipResponse(response, this.folderZipService, zip);
  }

  @Get('folders/:folderId/download-zip')
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'ZIP da pasta (com subpastas)' })
  @ApiUnprocessableEntityResponse({ description: 'Item is not a folder' })
  @ApiPayloadTooLargeResponse({ description: 'Folder exceeds the ZIP file count or size limit' })
  async downloadFolderZip(
    @Param('token') token: string,
    @Param('folderId') folderId: string,
    @Res() response: Response
  ): Promise<void> {
    const zip = await this.publicSharesService.prepareFolderZip(token, folderId);
    this.setPrivacyHeaders(response);
    await streamZipResponse(response, this.folderZipService, zip);
  }

  @Get('files/:fileId/download')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ description: 'File content. Google Docs/Sheets/Slides are exported to Office formats.' })
  @ApiUnprocessableEntityResponse({ description: 'Item is a folder or a Google type that cannot be downloaded' })
  async downloadFile(
    @Param('token') token: string,
    @Param('fileId') fileId: string,
    @Res() response: Response
  ): Promise<void> {
    const content = await this.publicSharesService.downloadFile(token, fileId);

    this.setPrivacyHeaders(response);
    response.setHeader('Content-Type', content.contentType);
    response.setHeader('Content-Disposition', buildAttachmentDisposition(content.fileName));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (content.sizeBytes !== null) {
      response.setHeader('Content-Length', String(content.sizeBytes));
    }

    try {
      await pipeline(content.stream, response);
    } catch (error) {
      this.logger.warn(`Public download stream interrupted: ${error instanceof Error ? error.message : 'unknown_error'}`);
      response.destroy();
    }
  }

  /** Links públicos não devem ser cacheados por proxies nem indexados por buscadores. */
  private setPrivacyHeaders(response: Response): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.setHeader('Referrer-Policy', 'no-referrer');
  }
}
