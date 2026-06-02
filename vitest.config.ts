import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'node',
    pool: 'forks',
    // SQLite spins up a real DB per test file; isolation per worker
    // keeps the suite easy to reason about without explicit cleanup.
    isolate: true,
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` is a Next.js shim that throws when imported
      // from a Client Component bundle. In Vitest we want a noop.
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
});
