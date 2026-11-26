import { Injectable, Logger } from '@nestjs/common';
import { ProviderIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDriveAuthorizationFailure } from './google-drive-storage.provider';

/**
 * Registra a saúde das conexões. Falhas de autorização do Google marcam a conexão como ERROR para que o
 * painel avise e as operações parem, em vez de falhar silenciosamente.
 */
@Injectable()
export class ConnectionHealthService {
  private readonly logger = new Logger(ConnectionHealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Retorna true se o erro era de autorização e a conexão foi marcada como ERROR. */
  async reportFailure(integrationId: string | null | undefined, error: unknown): Promise<boolean> {
    if (!integrationId || !isDriveAuthorizationFailure(error)) {
      return false;
    }

    await this.markError(integrationId, 'AUTHORIZATION_FAILED');
    return true;
  }

  async markError(integrationId: string, reason: string): Promise<void> {
    await this.prisma.providerIntegration
      .updateMany({
        where: { id: integrationId, status: ProviderIntegrationStatus.CONNECTED },
        data: { status: ProviderIntegrationStatus.ERROR, lastError: reason, lastErrorAt: new Date() }
      })
      .catch(() => undefined);
    this.logger.warn(`Connection ${integrationId.slice(0, 8)}... marked as ERROR reason=${reason}`);
  }
}
