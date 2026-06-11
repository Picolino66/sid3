import { ApiKeySecretService } from './api-key-secret.service';

describe(ApiKeySecretService.name, () => {
  it('generates a secret with prefix and stores only its hash', () => {
    const service = new ApiKeySecretService();

    const generated = service.generate();

    expect(generated.prefix).toMatch(/^[a-f0-9]{12}$/);
    expect(generated.secret).toMatch(new RegExp(`^sid3_live_${generated.prefix}_[A-Za-z0-9_-]+$`));
    expect(generated.secretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.secretHash).toBe(service.hash(generated.secret));
    expect(generated.secretHash).not.toContain(generated.secret);
  });

  it('extracts a valid prefix from a SID3 API key', () => {
    const service = new ApiKeySecretService();
    const generated = service.generate();

    expect(service.extractPrefix(generated.secret)).toBe(generated.prefix);
    expect(service.extractPrefix('invalid-key')).toBeNull();
  });
});
