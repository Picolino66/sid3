import { Module } from '@nestjs/common';
import { BucketsApiController } from './buckets-api.controller';
import { BucketsController } from './buckets.controller';
import { BucketsService } from './buckets.service';

@Module({
  controllers: [BucketsController, BucketsApiController],
  providers: [BucketsService],
  exports: [BucketsService]
})
export class BucketsModule {}
