import { PrismaService } from '../../prisma/prisma.service';

export type PoolMemberCredentials = {
  memberId: string;
  providerIntegrationId: string;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: Date | null;
  weight: number;
  roundRobinIndex: number;
};

export interface IPoolRoutingStrategy {
  selectMember(members: PoolMemberCredentials[], prisma: PrismaService): Promise<PoolMemberCredentials>;
}
