import { Injectable } from '@nestjs/common';
import { PoolRoutingStrategy } from '@prisma/client';
import { IPoolRoutingStrategy } from './pool-routing.strategy';
import { RoundRobinStrategy } from './round-robin.strategy';
import { FillFirstStrategy } from './fill-first.strategy';
import { WeightedStrategy } from './weighted.strategy';

@Injectable()
export class PoolRoutingFactory {
  constructor(
    private readonly roundRobin: RoundRobinStrategy,
    private readonly fillFirst: FillFirstStrategy,
    private readonly weighted: WeightedStrategy
  ) {}

  getStrategy(strategy: PoolRoutingStrategy): IPoolRoutingStrategy {
    switch (strategy) {
      case PoolRoutingStrategy.ROUND_ROBIN:
        return this.roundRobin;
      case PoolRoutingStrategy.FILL_FIRST:
        return this.fillFirst;
      case PoolRoutingStrategy.WEIGHTED:
        return this.weighted;
    }
  }
}
