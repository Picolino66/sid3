import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IPoolRoutingStrategy, PoolMemberCredentials } from './pool-routing.strategy';

@Injectable()
export class WeightedStrategy implements IPoolRoutingStrategy {
  async selectMember(members: PoolMemberCredentials[], _prisma: PrismaService): Promise<PoolMemberCredentials> {
    const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);
    let random = Math.random() * totalWeight;

    for (const member of members) {
      random -= member.weight;
      if (random <= 0) {
        return member;
      }
    }

    return members.at(-1)!;
  }
}
