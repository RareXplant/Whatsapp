import { describe, expect, it } from 'vitest';
import {
  createErrorResponse,
  createSuccessResponse,
  deserializeWithBuffers,
  exponentialBackoff,
  safeJsonParse,
  sanitizeForLog,
  serializeWithBuffers,
  sleep,
} from '../../../../src/shared/utils/index.js';

describe('shared/utils', () => {
  describe('exponentialBackoff', () => {
    it('returns a delay in [base, base*1.1] for attempt 0', () => {
      for (let i = 0; i < 100; i += 1) {
        const delay = exponentialBackoff(0, 100, 10_000);
        expect(delay).toBeGreaterThanOrEqual(100);
        expect(delay).toBeLessThanOrEqual(110);
      }
    });

    it('doubles the base per attempt capped at maxMs', () => {
      expect(exponentialBackoff(1, 100, 10_000)).toBeGreaterThanOrEqual(200);
      const capped = exponentialBackoff(10, 100, 1_000);
      expect(capped).toBeGreaterThanOrEqual(1_000);
      expect(capped).toBeLessThanOrEqual(1_100);
    });
  });

  describe('sleep', () => {
    it('resolves after approximately the requested delay', async () => {
      const start = Date.now();
      await sleep(20);
      expect(Date.now() - start).toBeGreaterThanOrEqual(15);
    });
  });

  describe('serializeWithBuffers / deserializeWithBuffers', () => {
    it('serializes buffers as { type: "Buffer", data } records', () => {
      const serialized = serializeWithBuffers({ buf: Buffer.from([1, 2, 3]) });
      expect(serialized).toContain('"type":"Buffer"');
    });

    it('restores buffers on deserialization', () => {
      const restored = deserializeWithBuffers(
        serializeWithBuffers({ buf: Buffer.from([1, 2, 3]), n: 5, s: 'x' }),
      ) as { buf: Buffer; n: number; s: string };
      expect(Buffer.isBuffer(restored.buf)).toBe(true);
      expect(restored.buf.equals(Buffer.from([1, 2, 3]))).toBe(true);
      expect(restored.n).toBe(5);
      expect(restored.s).toBe('x');
    });
  });

  describe('safeJsonParse', () => {
    it('parses valid JSON', () => {
      expect(safeJsonParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
    });

    it('returns null for invalid JSON', () => {
      expect(safeJsonParse('{"a":')).toBeNull();
      expect(safeJsonParse('')).toBeNull();
      expect(safeJsonParse('not json')).toBeNull();
    });
  });

  describe('sanitizeForLog', () => {
    it('redacts sensitive keys case-insensitively', () => {
      const sanitized = sanitizeForLog({
        password: 'pw',
        apiKey: 'ak',
        api_key: 'ak2',
        webhookSecret: 'ws',
        secret: 's',
        token: 't',
        creds: 'c',
        authState: 'as',
        jwt: 'j',
        JWT_SECRET: 'js',
        safeKey: 'keep-me',
      });
      expect(sanitized).toEqual({
        password: '[REDACTED]',
        apiKey: '[REDACTED]',
        api_key: '[REDACTED]',
        webhookSecret: '[REDACTED]',
        secret: '[REDACTED]',
        token: '[REDACTED]',
        creds: '[REDACTED]',
        authState: '[REDACTED]',
        jwt: '[REDACTED]',
        JWT_SECRET: '[REDACTED]',
        safeKey: 'keep-me',
      });
    });

    it('does not recurse into nested objects', () => {
      const sanitized = sanitizeForLog({ user: { password: 'nested' } }) as {
        user: { password: string };
      };
      expect(sanitized.user.password).toBe('nested');
    });

    it('returns non-object values unchanged', () => {
      expect(sanitizeForLog('a string')).toBe('a string');
      expect(sanitizeForLog(42)).toBe(42);
      expect(sanitizeForLog(null)).toBeNull();
      expect(sanitizeForLog(undefined)).toBeUndefined();
    });
  });

  describe('createSuccessResponse', () => {
    it('returns the success envelope', () => {
      expect(createSuccessResponse({ ok: true }, 'req_1')).toEqual({
        success: true,
        data: { ok: true },
        requestId: 'req_1',
      });
    });
  });

  describe('createErrorResponse', () => {
    it('returns the error envelope without details', () => {
      expect(createErrorResponse('BAD_INPUT', 'bad', 'req_1')).toEqual({
        success: false,
        error: { code: 'BAD_INPUT', message: 'bad', details: undefined },
        requestId: 'req_1',
      });
    });

    it('includes optional details', () => {
      expect(createErrorResponse('NOT_FOUND', 'missing', 'req_2', { id: 'x' })).toEqual({
        success: false,
        error: { code: 'NOT_FOUND', message: 'missing', details: { id: 'x' } },
        requestId: 'req_2',
      });
    });
  });
});
