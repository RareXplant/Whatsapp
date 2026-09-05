import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll } from 'vitest';

/**
 * Test environment defaults. Must be set before any src/module is imported so
 * that src/config.ts parses a valid, hermetic configuration. RATE_LIMIT and
 * metrics are disabled to keep tests fast and deterministic.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.METRICS_ENABLED = 'false';

process.env.JWT_SECRET = 'test-only-jwt-secret-that-is-longer-than-32-chars';
process.env.API_KEY_PEPPER = 'test-pepper';
process.env.AUTH_ENCRYPTION_KEY = 'test-encryption-key-32-bytes-abcdefghijkl';

process.env.MONGODB_DB_NAME = 'whatsapp-gateway-test';
if (!process.env.MONGODB_URI && process.env.VITEST_MONGODB_URI) {
  process.env.MONGODB_URI = process.env.VITEST_MONGODB_URI;
}

process.env.WEBHOOK_TIMEOUT_MS = '2000';
process.env.WEBHOOK_MAX_RETRIES = '2';
process.env.WEBHOOK_BASE_RETRY_MS = '10';
process.env.WEBHOOK_MAX_RETRY_MS = '50';

process.env.QR_TTL_SECONDS = '30';
process.env.MAX_RECONNECT_ATTEMPTS = '2';
process.env.MAX_RECONNECT_DELAY_MS = '500';

process.env.MEDIA_STORAGE = 'local';
process.env.DATA_DIR = path.join(os.tmpdir(), `whatsapp-gateway-test-${process.pid}`);

process.env.PORT = '0';

beforeAll(() => {
  if (!process.env.VITEST_MONGODB_URI) {
    throw new Error('VITEST_MONGODB_URI is not set; global-setup did not run');
  }
});

afterAll(() => {});
