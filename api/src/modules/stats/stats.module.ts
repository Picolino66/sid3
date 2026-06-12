import { Module } from '@nestjs/common';
import { StorageProvidersModule } from '../storage-providers/storage-providers.module';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [StorageProvidersModule],
  controllers: [StatsController],
  providers: [StatsService]
})
export class StatsModule {}
