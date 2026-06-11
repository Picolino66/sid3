import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class TokenEncryptionService {
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly configService: ConfigService) {}

  encrypt(plaintext: string): string {
    const key = this.getEncryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv, tag, ciphertext].map((part) => part.toString('base64')).join('.');
  }

  decrypt(payload: string): string {
    const key = this.getEncryptionKey();
    const [ivBase64, tagBase64, ciphertextBase64] = payload.split('.');

    if (!ivBase64 || !tagBase64 || !ciphertextBase64) {
      throw new InternalServerErrorException('Invalid encrypted token payload');
    }

    const decipher = createDecipheriv(this.algorithm, key, Buffer.from(ivBase64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, 'base64')),
      decipher.final()
    ]);

    return plaintext.toString('utf8');
  }

  private getEncryptionKey(): Buffer {
    const encodedKey = this.configService.getOrThrow<string>('TOKEN_ENCRYPTION_KEY');
    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }

    return key;
  }
}
