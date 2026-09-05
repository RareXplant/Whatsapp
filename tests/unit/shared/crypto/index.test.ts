import { describe, expect, it } from 'vitest';
import {
  decryptData,
  encryptData,
  generateApiKey,
  generateDeliveryId,
  generateInstanceId,
  generateRequestId,
  generateTenantId,
  generateWebhookSecret,
  generateWorkerId,
  hashApiKey,
  signWebhookPayload,
  verifyWebhookSignature,
} from '../../../../src/shared/crypto/index.js';

describe('shared/crypto', () => {
  describe('hashApiKey', () => {
    it('produces a deterministic 64 char hex digest for the same key and pepper', () => {
      expect(hashApiKey('wag_a_key', 'a-pepper')).toBe(hashApiKey('wag_a_key', 'a-pepper'));
      expect(hashApiKey('wag_a_key', 'a-pepper')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different digests for different keys or peppers', () => {
      expect(hashApiKey('key-a', 'pepper')).not.toBe(hashApiKey('key-b', 'pepper'));
      expect(hashApiKey('key', 'pepper-a')).not.toBe(hashApiKey('key', 'pepper-b'));
    });
  });

  describe('generateApiKey', () => {
    it('returns a unique key with the wag_ prefix', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^wag_[0-9a-f]{64}$/);
      expect(generateApiKey()).not.toBe(key);
    });
  });

  describe('encryptData / decryptData', () => {
    it('round-trips plaintext with AES-256-GCM', () => {
      const encrypted = encryptData('{"hello":"world"}', 'correct-key');
      expect(encrypted).not.toContain('hello');
      expect(decryptData(encrypted, 'correct-key')).toBe('{"hello":"world"}');
    });

    it('produces different ciphertext for repeated calls', () => {
      const a = encryptData('same', 'key');
      const b = encryptData('same', 'key');
      expect(a).not.toBe(b);
    });

    it('throws when decrypted with the wrong key', () => {
      const encrypted = encryptData('secret-message', 'right-key');
      expect(() => decryptData(encrypted, 'wrong-key')).toThrow();
    });

    it('throws when the ciphertext is tampered with', () => {
      const encrypted = encryptData('secret-message', 'right-key');
      const tampered = `${encrypted.slice(0, -2)}AA`;
      expect(() => decryptData(tampered, 'right-key')).toThrow();
    });
  });

  describe('generateWebhookSecret', () => {
    it('returns a 64 character hex secret', () => {
      expect(generateWebhookSecret()).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('signWebhookPayload / verifyWebhookSignature', () => {
    it('signs deterministically with HMAC-SHA256', () => {
      const a = signWebhookPayload('{"event":"x"}', 'secret');
      const b = signWebhookPayload('{"event":"x"}', 'secret');
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(a).toBe(b);
    });

    it('verifies a valid signature', () => {
      const signature = signWebhookPayload('payload', 'secret');
      expect(verifyWebhookSignature('payload', signature, 'secret')).toBe(true);
    });

    it('rejects a tampered payload', () => {
      const signature = signWebhookPayload('payload', 'secret');
      expect(verifyWebhookSignature('payload-mutated', signature, 'secret')).toBe(false);
    });

    it('rejects a signature created with a different secret', () => {
      const signature = signWebhookPayload('payload', 'secret-a');
      expect(verifyWebhookSignature('payload', signature, 'secret-b')).toBe(false);
    });

    it('rejects a malformed signature of different length', () => {
      expect(verifyWebhookSignature('payload', 'short', 'secret')).toBe(false);
    });
  });

  describe('id generators', () => {
    it('generates tenant ids with the t_ prefix', () => {
      expect(generateTenantId()).toMatch(/^t_[0-9a-f]{32}$/);
      expect(generateTenantId()).not.toBe(generateTenantId());
    });

    it('generates instance ids with the inst_ prefix', () => {
      expect(generateInstanceId()).toMatch(/^inst_[0-9a-f]{32}$/);
    });

    it('generates delivery ids with the del_ prefix', () => {
      expect(generateDeliveryId()).toMatch(/^del_[0-9a-f]{32}$/);
    });

    it('generates request ids with the req_ prefix', () => {
      expect(generateRequestId()).toMatch(/^req_[0-9a-f]{24}$/);
    });

    it('generates worker ids as hostname-pid-hex', () => {
      const workerId = generateWorkerId();
      expect(workerId).toContain(`-${process.pid}-`);
      expect(workerId).toMatch(/-[0-9a-f]{8}$/);
    });
  });
});
