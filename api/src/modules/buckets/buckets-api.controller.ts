import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { ApiKeyAuthContext, ApiKeyAuthGuard } from '../../common/auth/api-key-auth.guard';
import { CurrentApiKey } from '../../common/auth/current-api-key.decorator';
import { BucketsService } from './buckets.service';
import { BucketResponseDto } from './dto/bucket-response.dto';

@ApiTags('Buckets')
@ApiSecurity('apiKeyAuth')
@UseGuards(ApiKeyAuthGuard)
@Controller('buckets')
export class BucketsApiController {
  constructor(private readonly bucketsService: BucketsService) {}

  @Get()
  @ApiOkResponse({ type: BucketResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'API key inválida ou ausente' })
  listBuckets(@CurrentApiKey() apiKey: ApiKeyAuthContext): Promise<BucketResponseDto[]> {
    return this.bucketsService.listBucketsByProject(apiKey.projectId);
  }
}
