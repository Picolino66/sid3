import { Module } from '@nestjs/common';
import { StoragePoolsController } from './storage-pools.controller';
import { StoragePoolsService } from './storage-pools.service';
import { PoolRoutingFactory } from './pool-routing/pool-routing.factory';
import { RoundRobinStrategy } from './pool-routing/round-robin.strategy';
import { FillFirstStrategy } from './pool-routing/fill-first.strategy';
import { WeightedStrategy } from './pool-routing/weighted.strategy';

@Module({
  controllers: [StoragePoolsController],
  providers: [StoragePoolsService, PoolRoutingFactory, RoundRobinStrategy, FillFirstStrategy, WeightedStrategy],
  exports: [PoolRoutingFactory]
})
export class StoragePoolsModule {}
