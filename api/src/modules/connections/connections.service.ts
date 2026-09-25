import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Provider, ProviderIntegrationStatus, Prisma, Sid3RootFolderStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
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
  createdAt: Date;
};

const SID3_ROOT_FOLDER_NAME = 'sid3';

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  private readonly oauthStateTtlMs = 10 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleOAuthClient: GoogleOAuthClient,
    private readonly tokenEncryptionService: TokenEncryptionService,
    private readonly storageProviderRegistry: StorageProviderRegistry
  ) {}

  async createGoogleAuthorizationUrl(userId: string): Promise<{ authorizationUrl: string; stateExpiresAt: string }> {
    await this.ensureUserExists(userId);
    return this.generateOAuthState(userId);
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
    connectionId?: string
  ): Promise<{ authorizationUrl: string; stateExpiresAt: string }> {
    const state = randomBytes(32).toString('base64url');
    const stateExpiresAt = new Date(Date.now() + this.oauthStateTtlMs);

    await this.prisma.oAuthState.create({
      data: {
        userId,
        stateHash: this.hashState(state),
        redirectUri: 'google',
        connectionId: connectionId ?? null,
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
        connectionId: true
      }
    });

    if (!oauthState) {
      await this.logOAuthStateDiagnostics(userId, request.state);
      this.logger.warn(`Rejected Google OAuth callback for user=${this.maskId(userId)} reason=invalid_or_expired_state`);
      throw new BadRequestException('Estado OAuth inválido ou expirado');
    }

    try {
      const tokens = await this.googleOAuthClient.exchangeCode(request.code);
      let connection: PersistedConnection;

      if (oauthState.connectionId) {
        connection = await this.updateGoogleConnection(userId, oauthState.id, oauthState.connectionId, tokens);
        this.logger.log(
          `Reauthorized Google Drive connection=${this.maskId(connection.id)} user=${this.maskId(userId)} scopes=${connection.scopes.join(',')}`
        );
      } else {
        connection = await this.storeGoogleConnection(userId, oauthState.id, tokens);
        this.logger.log(
          `Connected Google Drive connection=${this.maskId(connection.id)} user=${this.maskId(userId)} scopes=${connection.scopes.join(',')}`
        );
      }

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

    const connection = await this.prisma.providerIntegration.findFirst({
      where: {
        id: connectionId,
        userId
      },
      select: { id: true }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }

    const revoked = await this.prisma.providerIntegration.update({
      where: { id: connection.id },
      data: {
        status: ProviderIntegrationStatus.REVOKED,
        revokedAt: new Date()
      },
      select: this.connectionSelect()
    });

    this.logger.log(`Revoked connection=${this.maskId(revoked.id)} user=${this.maskId(userId)}`);

    return this.toConnectionResponse(revoked);
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
    tokens: GoogleTokenResult
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
          displayName: null,
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
    tokens: GoogleTokenResult
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
          status: ProviderIntegrationStatus.CONNECTED,
          revokedAt: null
        },
        select: this.connectionSelect()
      });
    });
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
      createdAt: connection.createdAt.toISOString()
    };
  }

  connectionSelect(): Prisma.ProviderIntegrationSelect {
    return {
      id: true,
      provider: true,
      displayName: true,
      providerAccountEmail: true,
      status: true,
      scopes: true,
      sid3RootFolderStatus: true,
      createdAt: true
    };
  }
}
