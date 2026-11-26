import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { BucketsService } from './buckets.service';
import { BucketResponseDto } from './dto/bucket-response.dto';
import { CreateBucketRequestDto } from './dto/create-bucket-request.dto';
import { UpdateBucketRequestDto } from './dto/update-bucket-request.dto';

@ApiTags('Buckets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/buckets')
export class BucketsController {
  constructor(private readonly bucketsService: BucketsService) {}

  @Get()
  @ApiOkResponse({ type: BucketResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  listBuckets(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string
  ): Promise<BucketResponseDto[]> {
    return this.bucketsService.listBuckets(user.id, projectId);
  }

  @Post()
  @ApiCreatedResponse({ type: BucketResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing bearer token' })
  createBucket(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId') projectId: string,
    @Body() request: CreateBucketRequestDto
  ): Promise<BucketResponseDto> {
    return this.bucketsService.createBucket(user.id, projectId, request);
  }

  @Patch(':bucketId')
  @ApiOkResponse({ type: BucketResponseDto })
  updateBucket(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('bucketId', ParseUUIDPipe) bucketId: string,
    @Body() request: UpdateBucketRequestDto
  ): Promise<BucketResponseDto> {
    return this.bucketsService.updateBucket(user.id, projectId, bucketId, request);
  }

  @Delete(':bucketId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Bucket vazio excluído' })
  @ApiConflictResponse({ description: 'O bucket ainda tem arquivos' })
  deleteBucket(
    @CurrentUserContext() user: CurrentUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('bucketId', ParseUUIDPipe) bucketId: string
  ): Promise<void> {
    return this.bucketsService.deleteBucket(user.id, projectId, bucketId);
  }
}
