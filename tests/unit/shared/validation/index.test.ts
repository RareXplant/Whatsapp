import { describe, expect, it } from 'vitest';
import {
  instanceIdSchema,
  isValidJid,
  jidFromPhone,
  normalizePhoneNumber,
  tenantIdSchema,
} from '../../../../src/shared/validation/index.js';

describe('shared/validation', () => {
  describe('tenantIdSchema', () => {
    it('accepts non-empty tenant ids', () => {
      expect(tenantIdSchema.safeParse('t_abc123').success).toBe(true);
    });

    it('rejects empty tenant ids', () => {
      expect(tenantIdSchema.safeParse('').success).toBe(false);
    });
  });

  describe('instanceIdSchema', () => {
    it('accepts non-empty instance ids', () => {
      expect(instanceIdSchema.safeParse('inst_abc123').success).toBe(true);
    });

    it('rejects empty instance ids', () => {
      expect(instanceIdSchema.safeParse('').success).toBe(false);
    });
  });

  describe('normalizePhoneNumber', () => {
    it('strips a leading plus', () => {
      expect(normalizePhoneNumber('+15551234567')).toBe('15551234567');
    });

    it('removes non-numeric characters', () => {
      expect(normalizePhoneNumber('(555) 123-4567')).toBe('5551234567');
    });

    it('keeps digits-only numbers intact', () => {
      expect(normalizePhoneNumber('5511999990000')).toBe('5511999990000');
    });
  });

  describe('isValidJid', () => {
    it('accepts phone numbers on s.whatsapp.net', () => {
      expect(isValidJid('15551234567@s.whatsapp.net')).toBe(true);
    });

    it('accepts group ids', () => {
      expect(isValidJid('123456789@g.us')).toBe(true);
    });

    it('accepts lid jids', () => {
      expect(isValidJid('123456789@lid')).toBe(true);
    });

    it('rejects jids missing the @suffix', () => {
      expect(isValidJid('15551234567')).toBe(false);
    });

    it('rejects non-numeric local parts', () => {
      expect(isValidJid('abc123@s.whatsapp.net')).toBe(false);
    });

    it('rejects unknown domains', () => {
      expect(isValidJid('15551234567@example.com')).toBe(false);
    });
  });

  describe('jidFromPhone', () => {
    it('appends the s.whatsapp.net suffix for a plain phone', () => {
      expect(jidFromPhone('15551234567')).toBe('15551234567@s.whatsapp.net');
    });

    it('normalizes a leading plus before suffixing', () => {
      expect(jidFromPhone('+15551234567')).toBe('15551234567@s.whatsapp.net');
    });

    it('normalizes away the jid suffix when given a full jid', () => {
      expect(jidFromPhone('123456789@lid')).toBe('123456789@s.whatsapp.net');
    });
  });
});
