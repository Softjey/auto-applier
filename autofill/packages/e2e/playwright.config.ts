import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  // One browser profile, one server, one port: tests share them, so they run in series.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
});
