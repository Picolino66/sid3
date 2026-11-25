import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { Prisma, ProviderIntegrationStatus } from '@prisma/client';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { hasDriveFullReadScope } from '../drive-index/drive-index-scopes';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShareLinkRequestDto } from './dto/create-share-link-request.dto';
import { ShareLinkItemResponseDto, ShareLinkResponseDto, ShareLinkStatus } from './dto/share-link-response.dto';
import { generateShareLinkToken, hashShareLinkToken, shareLinkPublicPath } from './share-link-token';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LISTED_LINKS = 200;

const shareLinkSelect = {
  id: true,
  providerIntegrationId: true,
  name: true,
  encryptedToken: true,
  expiresAt: true,
  revokedAt: true,
  accessCount: true,
  lastAccessedAt: true,
  createdAt: true,
  items: { select: { providerFileId: true }, orderBy: { createdAt: 'asc' } }
} satisfies Prisma.ShareLinkSelect;

type PersistedShareLink = Prisma.ShareLinkGetPayload<{ select: typeof shareLinkSelect }>;

type IndexedItemSummary = { providerFileId: string; name: string; mimeType: string; isFolder: boolean };

/** Gestão, pelo dono, dos links públicos que expõem itens do índice do Drive. */
@Injectable()
export class ShareLinksService {
  private readonly logger = new Logger(ShareLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenEncryptionService: TokenEncryptionService
  ) {}

  async createShareLink(userId: string, dto: CreateShareLinkRequestDto): Promise<ShareLinkResponseDto> {
    const connection = await this.prisma.providerIntegration.findFirst({
      where: { id: dto.connectionId, userId },
      select: { id: true, status: true, scopes: true }
    });

    if (!connection) {
      throw new NotFoundException('Conexão não encontrada');
    }
    if (connection.status !== ProviderIntegrationStatus.CONNECTED) {
      throw new ConflictException('A conexão não está ativa. Reconecte o Google Drive antes de compartilhar.');
    }
    if (!hasDriveFullReadScope(connection.scopes)) {
      throw new ForbiddenException('A conexão não tem permissão de leitura do Drive. Reconecte a conta.');
    }

    const fileIds = [...new Set(dto.fileIds)];
    const indexed = await this.prisma.driveIndexEntry.findMany({
      where: { providerIntegrationId: connection.id, providerFileId: { in: fileIds } },
      select: { providerFileId: true }
    });
    if (indexed.length !== fileIds.length) {
      throw new BadRequestException(
        `${fileIds.length - indexed.length} item(ns) não estão no índice desta conexão. Atualize o Drive e tente de novo.`
      );
    }

    const token = generateShareLinkToken();
    const created = await this.prisma.shareLink.create({
      data: {
        ownerUserId: userId,
        providerIntegrationId: connection.id,
        name: dto.name ?? null,
        tokenHash: hashShareLinkToken(token),
        encryptedToken: this.tokenEncryptionService.encrypt(token),
        expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * DAY_MS) : null,
        items: { create: fileIds.map((providerFileId) => ({ providerFileId })) }
      },
      select: shareLinkSelect
    });

    this.logger.log(
      `Share link created link=${this.maskId(created.id)} connection=${this.maskId(connection.id)} items=${fileIds.length}`
    );

    const [response] = await this.toResponses([created]);
    return response!;
  }

  async listShareLinks(userId: string, connectionId?: string): Promise<ShareLinkResponseDto[]> {
    const links = await this.prisma.shareLink.findMany({
      where: { ownerUserId: userId, ...(connectionId ? { providerIntegrationId: connectionId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED_LINKS,
      select: shareLinkSelect
    });

    return this.toResponses(links);
  }

  async getShareLink(userId: string, shareLinkId: string): Promise<ShareLinkResponseDto> {
    const [response] = await this.toResponses([await this.findOwnedLink(userId, shareLinkId)]);
    return response!;
  }

  async revokeShareLink(userId: string, shareLinkId: string): Promise<ShareLinkResponseDto> {
    const link = await this.findOwnedLink(userId, shareLinkId);
    const revoked = link.revokedAt
      ? link
      : await this.prisma.shareLink.update({
          where: { id: link.id },
          data: { revokedAt: new Date() },
          select: shareLinkSelect
        });

    this.logger.log(`Share link revoked link=${this.maskId(link.id)}`);

    const [response] = await this.toResponses([revoked]);
    return response!;
  }

  private async findOwnedLink(userId: string, shareLinkId: string): Promise<PersistedShareLink> {
    const link = await this.prisma.shareLink.findFirst({
      where: { id: shareLinkId, ownerUserId: userId },
      select: shareLinkSelect
    });

    if (!link) {
      throw new NotFoundException('Link de compartilhamento não encontrado');
    }

    return link;
  }

  /** Resolve nomes/tipos dos itens no índice com uma consulta por conexão (não por link). */
  private async toResponses(links: PersistedShareLink[]): Promise<ShareLinkResponseDto[]> {
    const idsByConnection = new Map<string, Set<string>>();
    for (const link of links) {
      const ids = idsByConnection.get(link.providerIntegrationId) ?? new Set<string>();
      link.items.forEach((item) => ids.add(item.providerFileId));
      idsByConnection.set(link.providerIntegrationId, ids);
    }

    const summaries = new Map<string, IndexedItemSummary>();
    for (const [connectionId, ids] of idsByConnection) {
      const entries = await this.prisma.driveIndexEntry.findMany({
        where: { providerIntegrationId: connectionId, providerFileId: { in: [...ids] } },
        select: { providerFileId: true, name: true, mimeType: true, isFolder: true }
      });
      entries.forEach((entry) => summaries.set(`${connectionId}:${entry.providerFileId}`, entry));
    }

    return links.map((link) => {
      const token = this.tokenEncryptionService.decrypt(link.encryptedToken);
      const items: ShareLinkItemResponseDto[] = link.items.map((item) => {
        const summary = summaries.get(`${link.providerIntegrationId}:${item.providerFileId}`);
        return {
          id: item.providerFileId,
          name: summary?.name ?? null,
          mimeType: summary?.mimeType ?? null,
          isFolder: summary?.isFolder ?? false,
          available: Boolean(summary)
        };
      });

      return {
        id: link.id,
        connectionId: link.providerIntegrationId,
        name: link.name,
        token,
        publicPath: shareLinkPublicPath(token),
        status: this.statusOf(link),
        expiresAt: link.expiresAt?.toISOString() ?? null,
        revokedAt: link.revokedAt?.toISOString() ?? null,
        accessCount: link.accessCount,
        lastAccessedAt: link.lastAccessedAt?.toISOString() ?? null,
        createdAt: link.createdAt.toISOString(),
        items
      };
    });
  }

  private statusOf(link: Pick<PersistedShareLink, 'revokedAt' | 'expiresAt'>): ShareLinkStatus {
    if (link.revokedAt) return 'REVOKED';
    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
    return 'ACTIVE';
  }

  private maskId(value: string): string {
    return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
  }
}
