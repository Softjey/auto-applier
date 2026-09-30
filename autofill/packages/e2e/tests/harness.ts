import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, test as base, type BrowserContext, type Page } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '../../..');
const EXTENSION = resolve(ROOT, 'packages/extension/.output/chrome-mv3');
const FIXTURES = resolve(ROOT, 'fixtures');
const PORT = 7357;

async function waitForPort(): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      // Any HTTP answer (even the guard's 403) proves the server is up.
      await fetch(`http://127.0.0.1:${PORT}/ping`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error('plan server did not start');
}

/**
 * The real plan server (real resolve-fields, real matching) on a FAKE person
 * and a fixture CV — nothing here can type the real profile into a real form.
 */
async function startServer(): Promise<ChildProcess> {
  const server = spawn('pnpm', ['--filter', '@applier/server', 'start'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APPLIER_DATA_DIR: FIXTURES, // no apply-config.json here: tests never read the real one
      APPLIER_PROFILE_PATH: resolve(FIXTURES, 'profile.test.json'),
      AUTOFILL_RESUME_OUT: resolve(FIXTURES, 'out'),
    },
    stdio: 'ignore',
  });
  await waitForPort();
  return server;
}

interface Fixtures {
  context: BrowserContext;
  page: Page;
}

export const test = base.extend<Fixtures, { server: ChildProcess }>({
  server: [
    async ({}, use) => {
      const server = await startServer();
      await use(server);
      server.kill();
    },
    { scope: 'worker', auto: true },
  ],
  context: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), 'applier-e2e-'));
    const context = await chromium.launchPersistentContext(dir, {
      // Chromium (not Chrome): branded Chrome ignores --load-extension. CHROMIUM_PATH lets a
      // machine reuse a Chromium it already has instead of downloading Playwright's own.
      channel: 'chromium', // new headless: the only headless mode that runs extensions
      ...(process.env['CHROMIUM_PATH'] ? { executablePath: process.env['CHROMIUM_PATH'] } : {}),
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await use(context);
    await context.close();
    await rm(dir, { recursive: true, force: true });
  },
  page: async ({ context }, use) => {
    await use(await context.newPage());
  },
});

export { expect } from '@playwright/test';

/** Serve fixture HTML at a URL the extension matches, without touching the network. */
export async function serveFixture(
  context: BrowserContext,
  url: string,
  html: string,
): Promise<void> {
  await context.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body>${html}</body></html>`,
    }),
  );
}

/** The panel itself. The shadow host is zero-size (the panel is position:fixed inside it), so target the panel, not the host. */
export const panel = (page: Page) => page.locator('applier-autofill .af-panel');
