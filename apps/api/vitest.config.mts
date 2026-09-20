import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: process.env.RUN_DB_TESTS === '1' ? 60000 : 10000,
    maxWorkers: 1,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    restoreMocks: true,
  },
});
