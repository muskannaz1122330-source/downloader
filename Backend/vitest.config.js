import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setupEnv.js'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
  },
});
