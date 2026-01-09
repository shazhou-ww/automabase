import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30s timeout for API calls
    hookTimeout: 30000,
    include: ['src/**/*.test.ts'],
  },
});

