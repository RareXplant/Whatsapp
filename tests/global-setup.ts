import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Config } from './types.js';

const DEFAULT_TEST_DB = 'whatsapp-gateway-test';

/**
 * Starts a single in-memory MongoDB for the whole test run and exposes its URI
 * so per-file setup can connect the app's mongoose instance to it.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const mongod = await MongoMemoryServer.create({
    instance: { dbName: DEFAULT_TEST_DB },
  });

  process.env.VITEST_MONGODB_URI = mongod.getUri(DEFAULT_TEST_DB);

  const testConfig: Config = {
    mongodb: {
      memory: mongod,
      uri: mongod.getUri(DEFAULT_TEST_DB),
      dbName: DEFAULT_TEST_DB,
    },
  };
  (globalThis as unknown as { __VITEST_CONFIG__?: Config }).__VITEST_CONFIG__ = testConfig;

  return async () => {
    await mongod.stop();
  };
}
