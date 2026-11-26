import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, E2E_PORT } from './harness';

/**
 * A tab the EXTENSION opens (tabs.create) is not one Playwright can intercept in time — its first
 * request is already on the wire — and the first version of this spec silently loaded the real
 * justjoin.it. So the fixture is served by a real local HTTPS server and Chromium is told that
 * justjoin.it lives there: the URL, the host the adapter matches and the content script are real.
 */
const SITE_PORT = E2E_PORT - 1;
const pages = new Map<string, string>();
let site: Server;

test.use({
  extraArgs: [
    `--host-resolver-rules=MAP justjoin.it 127.0.0.1:${SITE_PORT}`,
    '--ignore-certificate-errors',
  ],
});

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'applier-e2e-tls-'));
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=justjoin.it',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
    ],
    { stdio: 'ignore' },
  );
  site = createServer(
    { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
    (req, res) => {
      const html = pages.get(req.url ?? '');
      res.writeHead(html === undefined ? 404 : 200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        html === undefined ? 'not found' : `<!doctype html><html><body>${html}</body></html>`,
      );
    },
  );
  await new Promise<void>((ok) => site.listen(SITE_PORT, '127.0.0.1', ok));
});
test.afterAll(() => new Promise((ok) => site.close(ok)));

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../../extension/test/fixtures', name), 'utf8');

const MCP = `http://127.0.0.1:${E2E_PORT}/mcp`;

/** What Claude Code does: JSON-RPC over HTTP, no Origin header. */
async function tool(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name, arguments: args },
    }),
  });
  const { result } = (await res.json()) as {
    result: { isError?: boolean; content: { text: string }[] };
  };
  const text = result.content[0]?.text ?? '';
  return { isError: result.isError === true, text, json: () => JSON.parse(text) };
}

// justjoin.it: the offer page has an Apply button; the modal opens behind it (and swallows the
// first click, as the live site does); sending replaces the modal with the confirmation.
const OFFER = `<h1>Dev at Acme</h1><button id="apply" type="button">Apply</button>
<script>
  let clicks = 0;
  document.getElementById('apply').addEventListener('click', () => {
    if (++clicks < 2) return;
    document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(fixture('justjoin-modal.html'))});
    document.getElementById('apply-form').addEventListener('submit', (e) => {
      e.preventDefault();
      window.__sent = true;
      document.getElementById('apply-form').replaceWith(
        Object.assign(document.createElement('div'), { textContent: 'Done! Your application has been sent to Acme' }));
    });
  });
</script>`;

test.describe('the agent drives the extension through MCP, with no browser tool', () => {
  test('open, fill and submit a justjoin.it offer', async ({ context }) => {
    pages.set('/job-offer/acme-dev', OFFER);

    await expect
      .poll(async () => (await tool('autofill_status')).json().extensionConnected, {
        timeout: 30_000,
      })
      .toBe(true);

    const filled = await tool('autofill_open_and_fill', {
      url: 'https://justjoin.it/job-offer/acme-dev',
    });
    expect(filled.isError, filled.text).toBe(false);
    const summary = filled.json();
    expect(summary, filled.text).toMatchObject({ adapter: 'justjoin', formOpen: true });
    expect(summary.filled).toBeGreaterThan(0);
    expect(summary.token).toBeTruthy();

    const page = context.pages().find((p) => p.url().includes('justjoin.it'));
    if (!page) throw new Error('the extension opened no tab');
    await expect(page.locator('[name=name]')).toHaveValue('Test Candidate');
    await expect(page.locator('[name=create_account_accepted]')).not.toBeChecked();

    const form = (await tool('autofill_read_form', { tab: summary.tab })).json();
    expect(form.find((f: { label: string }) => /name/i.test(f.label)).value).toBe('Test Candidate');

    // a wrong token never presses the button
    const refused = await tool('autofill_submit', { tab: summary.tab, token: 'wrong' });
    expect(refused.isError).toBe(true);
    expect(await page.evaluate(() => (window as { __sent?: boolean }).__sent)).toBeUndefined();

    const sent = await tool('autofill_submit', { tab: summary.tab, token: summary.token });
    expect(sent.isError, sent.text).toBe(false);
    expect(sent.json()).toEqual({ submitted: true, signal: 'success-text' });
    expect(await page.evaluate(() => (window as { __sent?: boolean }).__sent)).toBe(true);

    expect((await tool('autofill_close_tab', { tab: summary.tab })).isError).toBe(false);
  });

  test('a page that is not an offer says so instead of hanging', async ({ context }) => {
    pages.set('/job-offer/expired', '<p>Offer expired</p>');
    const out = await tool('autofill_open_and_fill', {
      url: 'https://justjoin.it/job-offer/expired',
    });
    expect(out.isError, out.text).toBe(false);
    expect(out.json()).toMatchObject({ formOpen: false, filled: 0 });
    expect(out.json().token).toBeUndefined();
    // nothing was submitted, and the tab is the agent's to close
    expect(context.pages().some((p) => p.url().endsWith('/job-offer/expired'))).toBe(true);
    expect((await tool('autofill_close_tab', { tab: out.json().tab })).isError).toBe(false);
  });
});
