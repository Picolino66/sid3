import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IPoolRoutingStrategy, PoolMemberCredentials } from './pool-routing.strategy';

@Injectable()
export class FillFirstStrategy implements IPoolRoutingStrategy {
  async selectMember(members: PoolMemberCredentials[], prisma: PrismaService): Promise<PoolMemberCredentials> {
    const memberIds = members.map((m) => m.providerIntegrationId);

    const usageRows = await prisma.storageObject.groupBy({
      by: ['resolvedIntegrationId'],
      where: {
        resolvedIntegrationId: { in: memberIds },
        status: { notIn: ['DELETED', 'FAILED'] }
      },
      _sum: { sizeBytes: true }
    });

    const usageMap = new Map<string, bigint>(
      usageRows.map((row) => [row.resolvedIntegrationId ?? '', row._sum.sizeBytes ?? BigInt(0)])
    );

    let selected = members[0]!;
    let minUsage = usageMap.get(selected.providerIntegrationId) ?? BigInt(0);

    for (const member of members.slice(1)) {
      const usage = usageMap.get(member.providerIntegrationId) ?? BigInt(0);
      if (usage < minUsage) {
        minUsage = usage;
        selected = member;
      }
    }

    return selected;
  }
}
