import { mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

export const DEFAULT_MAX_UPLOAD_MB = 1024;
export const DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_DRIVE_CHUNK_TIMEOUT_MS = 10 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;

export function getMaxUploadMb(value = process.env.SID3_MAX_UPLOAD_MB): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_MAX_UPLOAD_MB;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('SID3_MAX_UPLOAD_MB must be a positive integer');
  }

  return parsed;
}

export function getMaxUploadBytes(value = process.env.SID3_MAX_UPLOAD_MB): number {
  const bytes = getMaxUploadMb(value) * BYTES_PER_MB;
  if (!Number.isSafeInteger(bytes)) {
    throw new Error('SID3_MAX_UPLOAD_MB is too large');
  }
  return bytes;
}

export function getUploadTempDirectory(value = process.env.SID3_UPLOAD_TMP_DIR): string {
  const directory = resolve(value?.trim() || resolve(tmpdir(), 'sid3-uploads'));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}

export function getPositiveIntegerSetting(value: string | undefined, defaultValue: number, name: string): number {
  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function getUploadRequestTimeoutMs(value = process.env.SID3_UPLOAD_REQUEST_TIMEOUT_MS): number {
  return getPositiveIntegerSetting(value, DEFAULT_UPLOAD_REQUEST_TIMEOUT_MS, 'SID3_UPLOAD_REQUEST_TIMEOUT_MS');
}

export function getDriveChunkTimeoutMs(value = process.env.SID3_DRIVE_CHUNK_TIMEOUT_MS): number {
  return getPositiveIntegerSetting(value, DEFAULT_DRIVE_CHUNK_TIMEOUT_MS, 'SID3_DRIVE_CHUNK_TIMEOUT_MS');
}

export function validateUploadEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  getMaxUploadBytes(typeof config.SID3_MAX_UPLOAD_MB === 'string' ? config.SID3_MAX_UPLOAD_MB : undefined);
  getUploadTempDirectory(typeof config.SID3_UPLOAD_TMP_DIR === 'string' ? config.SID3_UPLOAD_TMP_DIR : undefined);
  getUploadRequestTimeoutMs(
    typeof config.SID3_UPLOAD_REQUEST_TIMEOUT_MS === 'string' ? config.SID3_UPLOAD_REQUEST_TIMEOUT_MS : undefined
  );
  getDriveChunkTimeoutMs(
    typeof config.SID3_DRIVE_CHUNK_TIMEOUT_MS === 'string' ? config.SID3_DRIVE_CHUNK_TIMEOUT_MS : undefined
  );
  return config;
}
