import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BucketsApiController } from './buckets-api.controller';
import { BucketsController } from './buckets.controller';
import { BucketsService } from './buckets.service';

@Module({
  imports: [PrismaModule, ApiKeysModule],
  controllers: [BucketsController, BucketsApiController],
  providers: [BucketsService],
  exports: [BucketsService]
})
export class BucketsModule {}
