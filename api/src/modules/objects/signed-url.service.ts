import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedTokenPayload {
  pid: string; // projectId
  bid: string; // bucketId
  oid: string; // objectId
  exp: number; // Unix timestamp in seconds
}

export interface GeneratedSignedUrl {
  url: string;
  token: string;
  expiresAt: string;
  expiresInSeconds: number;
}

@Injectable()
export class SignedUrlService {
  private readonly secret: string;

  constructor() {
    this.secret = process.env.SID3_SIGNED_URL_SECRET || process.env.JWT_SECRET || 'sid3-signed-url-secret-key-default';
  }

  generateSignedDownloadToken(
    bucketId: string,
    objectId: string,
    projectId: string,
    expiresInSeconds = 900
  ): GeneratedSignedUrl {
    const validExpiresIn = Math.max(1, Math.min(expiresInSeconds, 86400)); // entre 1s e 24h
    const exp = Math.floor(Date.now() / 1000) + validExpiresIn;

    const payload: SignedTokenPayload = {
      pid: projectId,
      bid: bucketId,
      oid: objectId,
      exp
    };

    const payloadSerialized = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = this.createSignature(payloadSerialized);
    const token = `${payloadSerialized}.${signature}`;

    const expiresAt = new Date(exp * 1000).toISOString();
    const url = `/buckets/${bucketId}/objects/${objectId}/download?token=${encodeURIComponent(token)}`;

    return {
      url,
      token,
      expiresAt,
      expiresInSeconds: validExpiresIn
    };
  }

  verifySignedDownloadToken(
    token: string,
    bucketId: string,
    objectId: string
  ): { projectId: string } | null {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [payloadSerialized, receivedSignature] = parts;
    if (!payloadSerialized || !receivedSignature) {
      return null;
    }

    const expectedSignature = this.createSignature(payloadSerialized);
    if (!this.safeCompare(receivedSignature, expectedSignature)) {
      return null;
    }

    try {
      const payloadJson = Buffer.from(payloadSerialized, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as SignedTokenPayload;

      const currentUnix = Math.floor(Date.now() / 1000);
      if (payload.exp < currentUnix) {
        return null;
      }

      if (payload.bid !== bucketId || payload.oid !== objectId) {
        return null;
      }

      return { projectId: payload.pid };
    } catch {
      return null;
    }
  }

  private createSignature(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    return timingSafeEqual(bufA, bufB);
  }
}
