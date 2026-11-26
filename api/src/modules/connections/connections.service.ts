import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { Provider, ProviderIntegrationStatus, Prisma, Sid3RootFolderStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { DriveIndexSyncService } from '../drive-index/drive-index-sync.service';
import { hasDriveFullReadScope } from '../drive-index/drive-index-scopes';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleDriveStorageProvider } from '../storage-providers/google-drive-storage.provider';
import { StorageProviderRegistry } from '../storage-providers/storage-provider.registry';
import { ConfirmSid3RootFolderRequestDto } from './dto/confirm-sid3-root-folder-request.dto';
import { ConnectionResponseDto } from './dto/connection-response.dto';
import { OAuthCallbackRequestDto } from './dto/oauth-callback-request.dto';
import { UpdateConnectionRequestDto } from './dto/update-connection-request.dto';
import { GoogleOAuthClient, GoogleTokenResult } from './google-oauth.client';

type PersistedConnection = {
  id: string;
  provider: Provider;
  displayName: string | null;
  providerAccountEmail: string | null;
  status: ProviderIntegrationStatus;
  scopes: string[];
  sid3RootFolderStatus: Sid3RootFolderStatus;
  lastError: string | null;
  lastErrorAt: Date | null;
  projectLinks: { project: { id: string; name: string } }[];
  createdAt: Date;
};

type AccountIdentity = { accountId: string; email: string | null };

const SID3_ROOT_FOLDER_NAME = 'sid3';
export const DEFAULT_CONNECTION_DISPLAY_NAME = 'GOOGLE_DRIVE';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private readonly oauthStateTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleOAuthClient: GoogleOAuthClient,
    private readonly tokenEncryptionService: TokenEncryptionService,
    private readonly storageProviderRegistry: StorageProviderRegistry,
    private readonly driveIndexSyncService: DriveIndexSyncService
  ) {}

  async createGoogleAuthorizationUrl(
    userId: string,
    displayName?: string | null
  ): Promise<{ authorizationUrl: string; stateExpiresAt: string }> {
    await this.ensureUserExists(userId);
    return this.generateOAuthState(userId, undefined, this.normalizeDisplayName(displayName));
  }

  async reauthorizeGoogle(
    userId: string,
    connectionId: string
  ): Promise<{ authorizationUrl: string; stateExpiresAt: string }> {
    await this.ensureUserExists(userId);

    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: { id: true }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    this.logger.log(`Reauthorizing connection=${this.maskId(connectionId)} user=${this.maskId(userId)}`);

    return this.generateOAuthState(userId, connectionId);
  }

  private async generateOAuthState(
    userId: string,
    connectionId?: string,
    displayName?: string
  ): Promise<{ authorizationUrl: string; stateExpiresAt: string }> {
    const state = randomBytes(32).toString('base64url');
    const stateExpiresAt = new Date(Date.now() + this.oauthStateTtlMs);

    await this.prisma.oAuthState.create({
      data: {
        userId,
        stateHash: this.hashState(state),
        redirectUri: 'google',
        connectionId: connectionId ?? null,
        displayName: displayName ?? null,
        expiresAt: stateExpiresAt
      }
    });

    this.logger.log(
      `Created Google OAuth state for user=${this.maskId(userId)}${connectionId ? ` connectionId=${this.maskId(connectionId)}` : ''} expiresAt=${stateExpiresAt.toISOString()}`
    );

    return {
      authorizationUrl: this.googleOAuthClient.createAuthorizationUrl(state),
      stateExpiresAt: stateExpiresAt.toISOString()
    };
  }

  async completeGoogleConnection(
    userId: string,
    request: OAuthCallbackRequestDto
  ): Promise<ConnectionResponseDto> {
    await this.ensureUserExists(userId);
    this.logger.log(`Received Google OAuth callback for user=${this.maskId(userId)}`);

    const oauthState = await this.prisma.oAuthState.findFirst({
      where: {
        userId,
        stateHash: this.hashState(request.state),
        consumedAt: null,
        expiresAt: { gt: new Date() }
      },
      select: {
        id: true,
        connectionId: true,
        displayName: true
      }
    });

    if (!oauthState) {
      await this.logOAuthStateDiagnostics(userId, request.state);
      this.logger.warn(`Rejected Google OAuth callback for user=${this.maskId(userId)} reason=invalid_or_expired_state`);
      throw new BadRequestException('Estado OAuth inválido ou expirado');
    }

    try {
      const tokens = await this.googleOAuthClient.exchangeCode(request.code);
      const identity = await this.resolveAccountIdentity(tokens);
      await this.assertAccountAllowed(userId, oauthState, identity);
      let connection: PersistedConnection;

      if (oauthState.connectionId) {
        connection = await this.updateGoogleConnection(userId, oauthState.id, oauthState.connectionId, tokens, identity);
        this.logger.log(
          `Reauthorized Google Drive connection=${this.maskId(connection.id)} user=${this.maskId(userId)} scopes=${connection.scopes.join(',')}`
        );
      } else {
        connection = await this.storeGoogleConnection(
          userId,
          oauthState.id,
          tokens,
          oauthState.displayName ?? DEFAULT_CONNECTION_DISPLAY_NAME,
          identity
        );
        this.logger.log(
          `Connected Google Drive connection=${this.maskId(connection.id)} user=${this.maskId(userId)} scopes=${connection.scopes.join(',')}`
        );
      }

      await this.scheduleInitialIndexing(userId, connection, oauthState.connectionId ? 'incremental' : 'full');

      return this.toConnectionResponse(connection);
    } catch (error) {
      this.logger.error(
        `Failed Google OAuth callback for user=${this.maskId(userId)} reason=${this.sanitizeError(error)}`
      );
      throw error;
    }
  }

  async listConnections(userId: string): Promise<ConnectionResponseDto[]> {
    await this.ensureUserExists(userId);

    const connections = await this.prisma.providerIntegration.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: this.connectionSelect()
    });

    return connections.map((connection) => this.toConnectionResponse(connection));
  }

  async updateConnection(
    userId: string,
    connectionId: string,
    dto: UpdateConnectionRequestDto
  ): Promise<ConnectionResponseDto> {
    await this.ensureUserExists(userId);

    const existing = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: { id: true }
    });

    if (!existing) {
      throw new NotFoundException('Conexão não encontrada');
    }

    const updated = await this.prisma.providerIntegration.update({
      where: { id: existing.id },
      data: { displayName: dto.displayName ?? null },
      select: this.connectionSelect()
    });

    this.logger.log(`Updated connection=${this.maskId(updated.id)} user=${this.maskId(userId)}`);

    return this.toConnectionResponse(updated);
  }

  async revokeConnection(userId: string, connectionId: string): Promise<ConnectionResponseDto> {
    await this.ensureUserExists(userId);

    const connection = await this.findConnectionCredentials(userId, connectionId);
    await this.revokeAtGoogleIfUnshared(connection);

    const revoked = await this.prisma.providerIntegration.update({
      where: { id: connection.id },
      data: {
        status: ProviderIntegrationStatus.REVOKED,
        revokedAt: new Date(),
        // Os tokens deixam de existir no SID3: reconectar exige um novo consentimento.
        encryptedAccessToken: '',
        encryptedRefreshToken: null,
        tokenExpiresAt: null
      },
      select: this.connectionSelect()
    });

    this.logger.log(`Revoked connection=${this.maskId(revoked.id)} user=${this.maskId(userId)}`);

    return this.toConnectionResponse(revoked);
  }

  /**
   * Exclui a conexão. Bloqueado enquanto houver buckets, pools ou arquivos guardados nela, para nunca deixar
   * objetos sem a conta que os guarda.
   */
  async deleteConnection(userId: string, connectionId: string): Promise<void> {
    await this.ensureUserExists(userId);
    const connection = await this.findConnectionCredentials(userId, connectionId);

    const [bucketCount, poolMemberCount, objectCount] = await Promise.all([
      this.prisma.bucket.count({ where: { providerIntegrationId: connection.id } }),
      this.prisma.storagePoolMember.count({ where: { providerIntegrationId: connection.id } }),
      this.prisma.storageObject.count({
        where: { resolvedIntegrationId: connection.id, deletedAt: null, status: { not: 'DELETED' } }
      })
    ]);

    if (bucketCount + poolMemberCount + objectCount > 0) {
      throw new ConflictException(
        `A conexão ainda está em uso: ${bucketCount} bucket(s), ${poolMemberCount} pool(s) e ${objectCount} arquivo(s). ` +
          'Troque o destino dos buckets e remova a conexão dos pools antes de excluí-la.'
      );
    }

    if (connection.status !== ProviderIntegrationStatus.REVOKED) {
      await this.revokeAtGoogleIfUnshared(connection);
    }

    await this.prisma.providerIntegration.delete({ where: { id: connection.id } });
    this.logger.log(`Deleted connection=${this.maskId(connection.id)} user=${this.maskId(userId)}`);
  }

  async confirmSid3RootFolder(
    userId: string,
    connectionId: string,
    dto: ConfirmSid3RootFolderRequestDto
  ): Promise<ConnectionResponseDto> {
    await this.ensureUserExists(userId);

    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: {
        id: true,
        provider: true,
        encryptedAccessToken: true,
        encryptedRefreshToken: true,
        tokenExpiresAt: true,
        sid3RootFolderStatus: true
      }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    if (connection.sid3RootFolderStatus !== Sid3RootFolderStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException('Não há confirmação pendente para a pasta "sid3" desta conexão');
    }

    if (dto.decision === 'DECLINE') {
      const driveProvider = this.storageProviderRegistry.getProvider(connection.provider) as GoogleDriveStorageProvider;
      const newFolderId = await driveProvider.createFolder(SID3_ROOT_FOLDER_NAME, connection);

      const updated = await this.prisma.providerIntegration.update({
        where: { id: connection.id },
        data: { sid3RootFolderRef: newFolderId, sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED },
        select: this.connectionSelect()
      });

      this.logger.log(
        `Declined pre-existing sid3 root folder for connection=${this.maskId(connection.id)} user=${this.maskId(userId)}; created a new one`
      );

      return this.toConnectionResponse(updated);
    }

    const updated = await this.prisma.providerIntegration.update({
      where: { id: connection.id },
      data: { sid3RootFolderStatus: Sid3RootFolderStatus.CONFIRMED },
      select: this.connectionSelect()
    });

    this.logger.log(
      `Confirmed reuse of pre-existing sid3 root folder for connection=${this.maskId(connection.id)} user=${this.maskId(userId)}`
    );

    return this.toConnectionResponse(updated);
  }

  /** Ao conectar (ou reconectar) uma conta com escopo de leitura, já dispara a indexação do Drive. */
  private async scheduleInitialIndexing(
    userId: string,
    connection: PersistedConnection,
    mode: 'incremental' | 'full'
  ): Promise<void> {
    if (!hasDriveFullReadScope(connection.scopes)) {
      return;
    }

    try {
      await this.driveIndexSyncService.requestRefresh(userId, connection.id, mode);
    } catch (error) {
      this.logger.warn(
        `Could not schedule drive indexing for connection=${this.maskId(connection.id)} reason=${this.sanitizeError(error)}`
      );
    }
  }

  private async logOAuthStateDiagnostics(userId: string, state: string): Promise<void> {
    const stateHash = this.hashState(state);
    const stateRecord = await this.prisma.oAuthState.findFirst({
      where: {
        userId,
        stateHash
      },
      select: {
        id: true,
        consumedAt: true,
        expiresAt: true
      }
    });

    if (!stateRecord) {
      this.logger.warn(`OAuth state diagnostics user=${this.maskId(userId)} state=not_found`);
      return;
    }

    this.logger.warn(
      `OAuth state diagnostics user=${this.maskId(userId)} state=${this.maskId(stateRecord.id)} consumed=${Boolean(
        stateRecord.consumedAt
      )} expired=${stateRecord.expiresAt.getTime() <= Date.now()} expiresAt=${stateRecord.expiresAt.toISOString()}`
    );
  }

  private async storeGoogleConnection(
    userId: string,
    oauthStateId: string,
    tokens: GoogleTokenResult,
    displayName: string,
    identity: AccountIdentity
  ): Promise<PersistedConnection> {
    return this.prisma.$transaction(async (tx) => {
      await tx.oAuthState.update({
        where: { id: oauthStateId },
        data: { consumedAt: new Date() }
      });

      return tx.providerIntegration.create({
        data: {
          userId,
          provider: Provider.GOOGLE_DRIVE,
          displayName,
          providerAccountId: identity.accountId,
          providerAccountEmail: identity.email,
          encryptedAccessToken: this.tokenEncryptionService.encrypt(tokens.accessToken),
          encryptedRefreshToken: tokens.refreshToken
            ? this.tokenEncryptionService.encrypt(tokens.refreshToken)
            : null,
          tokenExpiresAt: tokens.expiryDate,
          scopes: tokens.scopes,
          status: ProviderIntegrationStatus.CONNECTED,
          revokedAt: null
        },
        select: this.connectionSelect()
      });
    });
  }

  private async updateGoogleConnection(
    userId: string,
    oauthStateId: string,
    connectionId: string,
    tokens: GoogleTokenResult,
    identity: AccountIdentity
  ): Promise<PersistedConnection> {
    return this.prisma.$transaction(async (tx) => {
      await tx.oAuthState.update({
        where: { id: oauthStateId },
        data: { consumedAt: new Date() }
      });

      return tx.providerIntegration.update({
        where: { id: connectionId, userId },
        data: {
          encryptedAccessToken: this.tokenEncryptionService.encrypt(tokens.accessToken),
          encryptedRefreshToken: tokens.refreshToken
            ? this.tokenEncryptionService.encrypt(tokens.refreshToken)
            : undefined,
          tokenExpiresAt: tokens.expiryDate ?? undefined,
          scopes: tokens.scopes,
          providerAccountId: identity.accountId,
          providerAccountEmail: identity.email,
          status: ProviderIntegrationStatus.CONNECTED,
          revokedAt: null,
          lastError: null,
          lastErrorAt: null
        },
        select: this.connectionSelect()
      });
    });
  }

  private async resolveAccountIdentity(tokens: GoogleTokenResult): Promise<AccountIdentity> {
    const driveProvider = this.storageProviderRegistry.getProvider(Provider.GOOGLE_DRIVE) as GoogleDriveStorageProvider;
    return driveProvider.getAccountIdentity({
      provider: Provider.GOOGLE_DRIVE,
      encryptedAccessToken: this.tokenEncryptionService.encrypt(tokens.accessToken),
      encryptedRefreshToken: tokens.refreshToken ? this.tokenEncryptionService.encrypt(tokens.refreshToken) : null,
      tokenExpiresAt: tokens.expiryDate
    });
  }

  /**
   * Reconectar só aceita a mesma conta Google da conexão; conectar uma conta nova recusa contas já conectadas.
   * Isso impede que os tokens de uma conta substituam os de outra (incidente de 25/11/2026).
   */
  private async assertAccountAllowed(
    userId: string,
    oauthState: { id: string; connectionId: string | null },
    identity: AccountIdentity
  ): Promise<void> {
    const email = identity.email ?? 'informada';

    if (oauthState.connectionId) {
      const target = await this.prisma.providerIntegration.findFirst({
        where: { id: oauthState.connectionId, userId },
        select: { providerAccountId: true, providerAccountEmail: true }
      });

      if (target?.providerAccountId && target.providerAccountId !== identity.accountId) {
        await this.consumeState(oauthState.id);
        throw new ConflictException(
          `Esta conexão pertence a ${target.providerAccountEmail ?? 'outra conta Google'}, mas você entrou com ${email}. ` +
            'Entre com a mesma conta para reconectar, ou use "Conectar Google Drive" para adicionar a outra conta como uma conexão separada.'
        );
      }
    }

    const duplicate = await this.prisma.providerIntegration.findFirst({
      where: {
        userId,
        providerAccountId: identity.accountId,
        ...(oauthState.connectionId ? { id: { not: oauthState.connectionId } } : {})
      },
      select: { displayName: true }
    });

    if (duplicate) {
      await this.consumeState(oauthState.id);
      throw new ConflictException(
        `A conta ${email} já está conectada como "${duplicate.displayName ?? DEFAULT_CONNECTION_DISPLAY_NAME}". Use "Reconectar" nessa conexão.`
      );
    }
  }

  private async consumeState(oauthStateId: string): Promise<void> {
    await this.prisma.oAuthState.update({ where: { id: oauthStateId }, data: { consumedAt: new Date() } });
  }

  private async findConnectionCredentials(userId: string, connectionId: string) {
    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: connectionId, userId },
      select: {
        id: true,
        userId: true,
        provider: true,
        status: true,
        providerAccountId: true,
        encryptedAccessToken: true,
        encryptedRefreshToken: true,
        tokenExpiresAt: true
      }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    return connection;
  }

  /**
   * Revogar no Google derruba o consentimento inteiro da conta para o SID3. Só faz isso quando nenhuma outra
   * conexão ativa usa a mesma conta (ou uma conta ainda não identificada do mesmo usuário).
   */
  private async revokeAtGoogleIfUnshared(connection: {
    id: string;
    userId: string;
    provider: Provider;
    providerAccountId: string | null;
    encryptedAccessToken: string;
    encryptedRefreshToken: string | null;
    tokenExpiresAt: Date | null;
  }): Promise<void> {
    if (!connection.encryptedAccessToken) {
      return;
    }

    const driveProvider = this.storageProviderRegistry.getProvider(connection.provider) as GoogleDriveStorageProvider;
    const identity = await driveProvider.getAccountIdentity(connection).catch(() => null);
    const accountId = identity?.accountId ?? connection.providerAccountId;

    const sharedWith = await this.prisma.providerIntegration.count({
      where: {
        id: { not: connection.id },
        status: { not: ProviderIntegrationStatus.REVOKED },
        OR: [
          ...(accountId ? [{ providerAccountId: accountId }] : []),
          { userId: connection.userId, providerAccountId: null }
        ]
      }
    });

    if (sharedWith > 0) {
      this.logger.warn(`Skipped Google revoke for connection=${this.maskId(connection.id)}: account shared with other connections`);
      return;
    }

    const revoked = await driveProvider.revokeAuthorization(connection);
    this.logger.log(`Google revoke for connection=${this.maskId(connection.id)} result=${revoked ? 'revoked' : 'already_invalid'}`);
  }

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });

    if (!user) {
      throw new UnauthorizedException('Token de autenticação inválido');
    }
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private maskId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  }

  private normalizeDisplayName(displayName?: string | null): string {
    return displayName?.trim() || DEFAULT_CONNECTION_DISPLAY_NAME;
  }

  private sanitizeError(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message.replace(/code=[^&\s]+/gi, 'code=[redacted]');
    }

    return 'unknown_error';
  }

  private toConnectionResponse(connection: PersistedConnection): ConnectionResponseDto {
    return {
      id: connection.id,
      provider: connection.provider,
      displayName: connection.displayName,
      providerAccountEmail: connection.providerAccountEmail,
      status: connection.status,
      scopes: connection.scopes,
      sid3RootFolderStatus: connection.sid3RootFolderStatus,
      lastError: connection.lastError,
      lastErrorAt: connection.lastErrorAt?.toISOString() ?? null,
      projects: connection.projectLinks.map((link) => ({ id: link.project.id, name: link.project.name })),
      createdAt: connection.createdAt.toISOString()
    };
  }

  connectionSelect() {
    return {
      id: true,
      provider: true,
      displayName: true,
      providerAccountEmail: true,
      status: true,
      scopes: true,
      sid3RootFolderStatus: true,
      lastError: true,
      lastErrorAt: true,
      projectLinks: { select: { project: { select: { id: true, name: true } } }, orderBy: { createdAt: 'asc' } },
      createdAt: true
    } satisfies Prisma.ProviderIntegrationSelect;
  }
}
