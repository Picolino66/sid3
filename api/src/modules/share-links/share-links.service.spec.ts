import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProviderIntegrationStatus } from '@prisma/client';
import { TokenEncryptionService } from '../../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { hashShareLinkToken } from './share-link-token';
import { ShareLinksService } from './share-links.service';

describe(ShareLinksService.name, () => {
  const userId = '1b56a466-526f-43c8-a662-919994e0c876';
  const connectionId = '5817530b-6388-4e7c-910d-387c8a5f9eda';
  const shareLinkId = '0c1f7a52-2f5e-4a4e-9d43-5c2b7f1f6b10';
  const createdAt = new Date('2026-11-24T12:00:00.000Z');

  let providerIntegration: { findFirst: jest.Mock };
  let driveIndexEntry: { findMany: jest.Mock };
  let shareLink: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  let service: ShareLinksService;

  function persistedLink(overrides: Record<string, unknown> = {}) {
    return {
      id: shareLinkId,
      providerIntegrationId: connectionId,
      name: 'Fotos',
      encryptedToken: 'enc:the-token',
      expiresAt: null,
      revokedAt: null,
      accessCount: 0,
      lastAccessedAt: null,
      createdAt,
      items: [{ providerFileId: 'pasta' }, { providerFileId: 'sumiu' }],
      ...overrides
    };
  }

  beforeEach(() => {
    providerIntegration = {
      findFirst: jest.fn().mockResolvedValue({
        id: connectionId,
        status: ProviderIntegrationStatus.CONNECTED,
        scopes: ['https://www.googleapis.com/auth/drive.readonly']
      })
    };
    driveIndexEntry = { findMany: jest.fn() };
    shareLink = {
      create: jest.fn().mockResolvedValue(persistedLink()),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    };
    const tokenEncryption = {
      encrypt: jest.fn((value: string) => `enc:${value}`),
      decrypt: jest.fn((value: string) => value.replace('enc:', ''))
    };

    service = new ShareLinksService(
      { providerIntegration, driveIndexEntry, shareLink } as unknown as PrismaService,
      tokenEncryption as unknown as TokenEncryptionService
    );
  });

  describe('createShareLink', () => {
    it('creates a link with a hashed and an encrypted token, deduplicating items', async () => {
      driveIndexEntry.findMany
        .mockResolvedValueOnce([{ providerFileId: 'pasta' }, { providerFileId: 'foto' }])
        .mockResolvedValueOnce([{ providerFileId: 'pasta', name: 'Evento', mimeType: 'application/vnd.google-apps.folder', isFolder: true }]);

      const response = await service.createShareLink(userId, {
        connectionId,
        fileIds: ['pasta', 'foto', 'pasta'],
        name: 'Fotos',
        expiresInDays: 7
      });

      const data = shareLink.create.mock.calls[0][0].data;
      expect(data.ownerUserId).toBe(userId);
      expect(data.items).toEqual({ create: [{ providerFileId: 'pasta' }, { providerFileId: 'foto' }] });
      const token = data.encryptedToken.replace('enc:', '');
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(data.tokenHash).toBe(hashShareLinkToken(token));
      expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600 * 1000);

      expect(response).toEqual(
        expect.objectContaining({
          id: shareLinkId,
          token: 'the-token',
          publicPath: '/s/the-token',
          status: 'ACTIVE',
          items: [
            { id: 'pasta', name: 'Evento', mimeType: 'application/vnd.google-apps.folder', isFolder: true, available: true },
            { id: 'sumiu', name: null, mimeType: null, isFolder: false, available: false }
          ]
        })
      );
    });

    it('rejects items that are not in the connection index', async () => {
      driveIndexEntry.findMany.mockResolvedValueOnce([{ providerFileId: 'a' }]);

      await expect(service.createShareLink(userId, { connectionId, fileIds: ['a', 'de-outra-conta'] })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(shareLink.create).not.toHaveBeenCalled();
    });

    it('rejects connections of other users, inactive ones, and ones without read scope', async () => {
      providerIntegration.findFirst.mockResolvedValueOnce(null);
      await expect(service.createShareLink(userId, { connectionId, fileIds: ['a'] })).rejects.toBeInstanceOf(NotFoundException);

      providerIntegration.findFirst.mockResolvedValueOnce({ id: connectionId, status: ProviderIntegrationStatus.REVOKED, scopes: [] });
      await expect(service.createShareLink(userId, { connectionId, fileIds: ['a'] })).rejects.toBeInstanceOf(ConflictException);

      providerIntegration.findFirst.mockResolvedValueOnce({
        id: connectionId,
        status: ProviderIntegrationStatus.CONNECTED,
        scopes: ['https://www.googleapis.com/auth/drive.file']
      });
      await expect(service.createShareLink(userId, { connectionId, fileIds: ['a'] })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('lists only the user links and reports expired and revoked status', async () => {
    shareLink.findMany.mockResolvedValue([
      persistedLink({ id: 'expirado', expiresAt: new Date(Date.now() - 1000), items: [] }),
      persistedLink({ id: 'revogado', revokedAt: new Date(), items: [] })
    ]);
    driveIndexEntry.findMany.mockResolvedValue([]);

    const links = await service.listShareLinks(userId, connectionId);

    expect(shareLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerUserId: userId, providerIntegrationId: connectionId } })
    );
    expect(links.map((link) => link.status)).toEqual(['EXPIRED', 'REVOKED']);
  });

  it('revokes a link once and returns 404 for links of other users', async () => {
    shareLink.findFirst.mockResolvedValueOnce(persistedLink());
    shareLink.update.mockResolvedValueOnce(persistedLink({ revokedAt: new Date() }));
    driveIndexEntry.findMany.mockResolvedValue([]);

    const revoked = await service.revokeShareLink(userId, shareLinkId);
    expect(revoked.status).toBe('REVOKED');
    expect(shareLink.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: shareLinkId, ownerUserId: userId } }));

    shareLink.findFirst.mockResolvedValueOnce(null);
    await expect(service.revokeShareLink(userId, shareLinkId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
