import { BufferJSON } from '@whiskeysockets/baileys';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function exponentialBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = delay * 0.2 * Math.random();
  return Math.floor(delay + jitter - jitter / 2);
}

export function serializeWithBuffers(obj: unknown): string {
  return JSON.stringify(obj, BufferJSON.replacer);
}

export function deserializeWithBuffers(json: string): unknown {
  return JSON.parse(json, BufferJSON.reviver);
}

export function safeJsonParse<T>(json: string): T | null {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function sanitizeForLog(input: unknown): unknown {
  if (typeof input === 'object' && input !== null) {
    const sanitized = { ...(input as Record<string, unknown>) };
    const sensitiveKeys = [
      'password',
      'secret',
      'token',
      'apiKey',
      'api_key',
      'creds',
      'authState',
      'webhookSecret',
      'jwt',
      'jwt_secret',
    ];
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    return sanitized;
  }
  return input;
}

export function createSuccessResponse<T>(
  data: T,
  requestId: string,
): {
  success: true;
  data: T;
  requestId: string;
} {
  return { success: true, data, requestId };
}

export function createErrorResponse(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
  requestId: string;
} {
  return {
    success: false,
    error: { code, message, details },
    requestId,
  };
}
