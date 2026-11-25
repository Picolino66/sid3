import { describe, test } from 'node:test';
import assert from 'node:assert';
import { transportStreamStartPoint } from './transport-stream-playback.js';

describe('transportStreamStartPoint', () => {
  const size = 230_951_232; // 01.01 A Empresa e o Empresário (MPEG-TS)
  const duration = 1567.132;

  test('starts from the beginning for zero or invalid inputs', () => {
    assert.deepStrictEqual(transportStreamStartPoint(0, duration, size), { offset: 0, baseTime: 0 });
    assert.deepStrictEqual(transportStreamStartPoint(-5, duration, size), { offset: 0, baseTime: 0 });
    assert.deepStrictEqual(transportStreamStartPoint(60, 0, size), { offset: 0, baseTime: 0 });
  });

  test('maps the time proportionally to a byte aligned to a 188-byte packet', () => {
    const { offset, baseTime } = transportStreamStartPoint(900, duration, size);
    assert.strictEqual(offset % 188, 0);
    assert.ok(Math.abs(offset - (900 / duration) * size) < 188);
    assert.ok(Math.abs(baseTime - 900) < 0.01);
  });

  test('never starts past the last packet', () => {
    const { offset } = transportStreamStartPoint(duration * 2, duration, size);
    assert.ok(offset < size);
    assert.strictEqual(offset % 188, 0);
  });
});
