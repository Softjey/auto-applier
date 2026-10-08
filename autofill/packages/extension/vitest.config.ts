import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'extension',
    environment: 'happy-dom',
    // Fixtures carry real third-party iframe URLs (captcha widgets): never fetch them.
    environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
    include: ['test/**/*.test.ts'],
  },
});
