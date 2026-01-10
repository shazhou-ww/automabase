import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30s timeout for API calls
    hookTimeout: 30000,
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/setup.ts'],
  },
  resolve: {
    alias: {
      '@automabase/automata-auth': resolve(__dirname, '../packages/automata-auth/src'),
    },
  },
});

