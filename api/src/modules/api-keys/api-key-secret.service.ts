import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';

export type GeneratedApiKey = {
  prefix: string;
  secret: string;
  secretHash: string;
};

@Injectable()
export class ApiKeySecretService {
  generate(): GeneratedApiKey {
    const prefix = randomBytes(6).toString('hex');
    const secretPart = randomBytes(24).toString('base64url');
    const secret = `sid3_live_${prefix}_${secretPart}`;

    return {
      prefix,
      secret,
      secretHash: this.hash(secret)
    };
  }

  hash(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  extractPrefix(secret: string): string | null {
    const [, , prefix] = secret.split('_');
    return prefix && /^[a-f0-9]{12}$/.test(prefix) ? prefix : null;
  }
}
