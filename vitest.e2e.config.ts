import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Dedicated config for end-to-end tests. These boot the full application via
 * createApplication() against the in-memory MongoDB, so they are excluded from
 * the default `npm test` run to keep it fast.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    exclude: [],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
});