import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'server',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The fake person: the real resolver and salary-quote must never read profile.json in a test.
    env: { APPLIER_PROFILE_PATH: resolve(import.meta.dirname, '../../fixtures/profile.test.json') },
  },
});
