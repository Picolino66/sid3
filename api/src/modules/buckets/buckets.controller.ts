import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CurrentUserContext } from '../../common/auth/current-user.decorator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/auth/types';
import { BucketsService } from './buckets.service';
import { BucketResponseDto } from './dto/bucket-response.dto';
import { CreateBucketRequestDto } from './dto/create-bucket-request.dto';

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
}
