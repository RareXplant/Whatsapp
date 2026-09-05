import { z } from 'zod';

export const tenantIdSchema = z.string().min(1);
export const instanceIdSchema = z.string().min(1);

export function normalizePhoneNumber(input: string): string {
  const cleaned = input.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) return cleaned.slice(1);
  return cleaned;
}

export function isValidJid(jid: string): boolean {
  return /^\d+@(s\.whatsapp\.net|g\.us|lid)$/.test(jid);
}

export function jidFromPhone(phone: string): string {
  const cleaned = normalizePhoneNumber(phone);
  if (cleaned.includes('@')) return cleaned;
  return `${cleaned}@s.whatsapp.net`;
}
