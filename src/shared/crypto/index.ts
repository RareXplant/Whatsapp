import crypto from 'node:crypto';
import os from 'node:os';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function hashApiKey(key: string, pepper: string): string {
  return crypto.createHmac('sha256', pepper).update(key).digest('hex');
}

export function generateApiKey(): string {
  return `wag_${crypto.randomBytes(32).toString('hex')}`;
}

export function encryptData(data: string, encryptionKey: string): string {
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

export function decryptData(encryptedData: string, encryptionKey: string): string {
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  const buffer = Buffer.from(encryptedData, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(buffer.length - TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH, buffer.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function signWebhookPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = signWebhookPayload(payload, secret);
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function generateTenantId(): string {
  return `t_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateInstanceId(): string {
  return `inst_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateDeliveryId(): string {
  return `del_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(12).toString('hex')}`;
}

export function generateWorkerId(): string {
  const hostname = os.hostname();
  const pid = process.pid;
  return `${hostname}-${pid}-${crypto.randomBytes(4).toString('hex')}`;
}
