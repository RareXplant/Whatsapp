import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.js';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../helpers/index.js';

describe('test infrastructure smoke', () => {
  it('parses a hermetic test config', () => {
    expect(config.NODE_ENV).toBe('test');
    expect(config.RATE_LIMIT_ENABLED).toBe(false);
    expect(config.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('connects to the in-memory mongodb', async () => {
    await connectTestDb();
    await clearTestDb();
    await disconnectTestDb();
    expect(true).toBe(true);
  });
});
