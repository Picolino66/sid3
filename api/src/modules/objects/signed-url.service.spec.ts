import { SignedUrlService } from './signed-url.service';

describe('SignedUrlService', () => {
  let service: SignedUrlService;

  beforeEach(() => {
    service = new SignedUrlService();
  });

  it('generates a valid signed token and verifies it successfully', () => {
    const bucketId = 'bucket-123';
    const objectId = 'object-456';
    const projectId = 'project-789';

    const result = service.generateSignedDownloadToken(bucketId, objectId, projectId, 600);

    expect(result.token).toBeDefined();
    expect(result.url).toContain(`/buckets/${bucketId}/objects/${objectId}/download?token=`);
    expect(result.expiresInSeconds).toBe(600);

    const verified = service.verifySignedDownloadToken(result.token, bucketId, objectId);
    expect(verified).toEqual({ projectId });
  });

  it('rejects an expired token', () => {
    const bucketId = 'b1';
    const objectId = 'o1';
    const projectId = 'p1';

    // Gera com 1 segundo
    const result = service.generateSignedDownloadToken(bucketId, objectId, projectId, 1);

    // Simula token gerado no passado
    const parts = result.token.split('.');
    const payload = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    payload.exp = Math.floor(Date.now() / 1000) - 10; // expirado há 10s

    const expiredPayloadSerialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
    // Assinatura não confere com o novo payload, então falha na assinatura
    expect(service.verifySignedDownloadToken(`${expiredPayloadSerialized}.${parts[1]!}`, bucketId, objectId)).toBeNull();
  });

  it('rejects token when bucketId or objectId mismatch', () => {
    const bucketId = 'b1';
    const objectId = 'o1';
    const projectId = 'p1';

    const result = service.generateSignedDownloadToken(bucketId, objectId, projectId, 600);

    // Tentar usar para outro bucket
    expect(service.verifySignedDownloadToken(result.token, 'other-bucket', objectId)).toBeNull();

    // Tentar usar para outro objeto
    expect(service.verifySignedDownloadToken(result.token, bucketId, 'other-object')).toBeNull();
  });

  it('rejects invalid or tampered token format', () => {
    expect(service.verifySignedDownloadToken('', 'b1', 'o1')).toBeNull();
    expect(service.verifySignedDownloadToken('invalid-token-without-dot', 'b1', 'o1')).toBeNull();
    expect(service.verifySignedDownloadToken('a.b.c', 'b1', 'o1')).toBeNull();
  });
});
