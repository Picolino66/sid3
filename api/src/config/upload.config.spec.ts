import {
  DEFAULT_MAX_UPLOAD_MB,
  getDriveChunkTimeoutMs,
  getMaxUploadBytes,
  getMaxUploadMb,
  getUploadRequestTimeoutMs
} from './upload.config';

describe('upload configuration', () => {
  it('defaults to 1 GB', () => {
    expect(getMaxUploadMb(undefined)).toBe(DEFAULT_MAX_UPLOAD_MB);
    expect(getMaxUploadBytes(undefined)).toBe(1024 * 1024 * 1024);
  });

  it('accepts a positive integer override', () => {
    expect(getMaxUploadMb('2048')).toBe(2048);
  });

  it.each(['0', '-1', '1.5', 'invalid'])('rejects invalid values: %s', (value) => {
    expect(() => getMaxUploadMb(value)).toThrow('SID3_MAX_UPLOAD_MB must be a positive integer');
  });

  it('provides upload-safe timeout defaults', () => {
    expect(getUploadRequestTimeoutMs(undefined)).toBe(1_800_000);
    expect(getDriveChunkTimeoutMs(undefined)).toBe(600_000);
  });
});
