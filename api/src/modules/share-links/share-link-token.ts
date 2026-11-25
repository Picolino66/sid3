import { createHash, randomBytes } from 'crypto';

/** 32 bytes aleatórios em base64url = 43 caracteres; inviável de adivinhar. */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateShareLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashShareLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isWellFormedShareLinkToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function shareLinkPublicPath(token: string): string {
  return `/s/${token}`;
}
