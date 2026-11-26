import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectListResponseDto } from './dto/object-list-response.dto';
import { StorageObjectResponseDto } from './dto/storage-object-response.dto';
import { UploadObjectRequestDto } from './dto/upload-object-request.dto';
import { ObjectAccessContext, ObjectsService } from './objects.service';
import { UploadCleanupInterceptor } from './upload-cleanup.interceptor';
import { UploadProblemDetailsFilter } from './upload-problem-details.filter';

/**
 * Arquivos dos buckets para o dono do projeto, autenticado no painel (JWT) — sem precisar de chave de API.
 */
@ApiTags('Objects (painel)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/buckets/:bucketId/objects')
export class OwnerObjectsController {
  constructor(
    private readonly objectsService: ObjectsService,
    private readonly prisma: PrismaService
  ) {}

  @Get()
  @ApiQuery({ name: 'prefix', required: false, description: 'Pasta atual, ex.: "images/2026/"' })
  @ApiQuery({ name: 'delimiter', required: false, description: 'Use "/" para navegar por pastas' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '1 a 200 (padrão 50)' })
  @ApiOkResponse({ type: ObjectListResponseDto, description: 'Itens trazem downloadUrl relativo à base da API.' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  async listObjects(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('bucketId', ParseUUIDPipe) bucketId: string,
    @Query('prefix') prefix?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('delimiter') delimiter?: string
  ): Promise<ObjectListResponseDto> {
    const access = await this.ownerAccess(user, projectId);
    return this.objectsService.listObjects(
      access,
      bucketId,
      { prefix, limit, cursor, delimiter },
      { includeDownloadUrls: true }
    );
  }

  @Post()
  @UseInterceptors(UploadCleanupInterceptor, FileInterceptor('file'))
  @UseFilters(UploadProblemDetailsFilter)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['key', 'file'],
      properties: { key: { type: 'string' }, file: { type: 'string', format: 'binary' } }
    }
  })
  @ApiCreatedResponse({ type: StorageObjectResponseDto })
  async uploadObject(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('bucketId', ParseUUIDPipe) bucketId: string,
    @Body() request: UploadObjectRequestDto,
    @UploadedFile() file: Express.Multer.File
  ): Promise<StorageObjectResponseDto> {
    const access = await this.ownerAccess(user, projectId);
    return this.objectsService.uploadObject(access, bucketId, request, file);
  }

  @Delete(':objectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Arquivo excluído do Drive e marcado como removido' })
  async deleteObject(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('bucketId', ParseUUIDPipe) bucketId: string,
    @Param('objectId', ParseUUIDPipe) objectId: string
  ): Promise<void> {
    const access = await this.ownerAccess(user, projectId);
    await this.objectsService.deleteObject(access, bucketId, objectId);
  }

  private async ownerAccess(user: CurrentUser, projectId: string): Promise<ObjectAccessContext> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerUserId: user.id },
      select: { id: true }
    });

    if (!project) {
      throw new NotFoundException('Projeto não encontrado');
    }

    return { projectId: project.id, apiKeyId: null, userId: user.id };
  }
}
