import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenEncryptionService } from './token-encryption.service';

describe(TokenEncryptionService.name, () => {
  const validKey = Buffer.alloc(32, 7).toString('base64');

  it('encrypts and decrypts token values', () => {
    const configService = {
      getOrThrow: jest.fn().mockReturnValue(validKey)
    } as unknown as ConfigService;
    const service = new TokenEncryptionService(configService);

    const encrypted = service.encrypt('google-access-token');

    expect(encrypted).not.toBe('google-access-token');
    expect(service.decrypt(encrypted)).toBe('google-access-token');
  });

  it('rejects malformed encrypted payloads', () => {
    const service = new TokenEncryptionService({
      getOrThrow: jest.fn().mockReturnValue(validKey)
    } as unknown as ConfigService);

    expect(() => service.decrypt('invalid-payload')).toThrow(InternalServerErrorException);
  });

  it('rejects encryption keys that are not 32 bytes', () => {
    const service = new TokenEncryptionService({
      getOrThrow: jest.fn().mockReturnValue(Buffer.alloc(16, 7).toString('base64'))
    } as unknown as ConfigService);

    expect(() => service.encrypt('google-access-token')).toThrow(InternalServerErrorException);
  });
});
