import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.{ts,tsx}',
      'tests/postgres-integration/**/*.pgtest.ts',
    ],
    globals: true,
    environment: 'node',
    pool: 'forks',
    isolate: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'json', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
