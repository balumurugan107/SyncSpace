import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup-env.ts'],
    // Integration tests share one PostgreSQL database, so run files serially.
    fileParallelism: false,
    testTimeout: 15000,
  },
});
