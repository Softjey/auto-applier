import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The fake person: the real resolver and salary-quote must never read profile.json in a test.
    env: {
      // No apply-config.json in fixtures, so the real vocabulary never leaks into a test.
      APPLIER_DATA_DIR: resolve(import.meta.dirname, '../../fixtures'),
      APPLIER_PROFILE_PATH: resolve(import.meta.dirname, '../../fixtures/profile.test.json'),
    },
  },
});
