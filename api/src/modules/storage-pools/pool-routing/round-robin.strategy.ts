import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IPoolRoutingStrategy, PoolMemberCredentials } from './pool-routing.strategy';

@Injectable()
export class RoundRobinStrategy implements IPoolRoutingStrategy {
  async selectMember(members: PoolMemberCredentials[], prisma: PrismaService): Promise<PoolMemberCredentials> {
    const sorted = [...members].sort((a, b) => a.roundRobinIndex - b.roundRobinIndex);
    const selected = sorted[0]!;

    await prisma.storagePoolMember.update({
      where: { id: selected.memberId },
      data: { roundRobinIndex: { increment: 1 } },
      select: { id: true }
    });

    return selected;
  }
}
