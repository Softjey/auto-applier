import type { BrowserContext } from '@playwright/test';
import { expect, serveFixture, test, E2E_PORT } from './harness';

/**
 * The captcha clicker in a real Chromium against stand-ins for the widgets, served at the widgets'
 * REAL frame URLs (www.google.com/recaptcha/api2/anchor, *.hcaptcha.com/…#frame=checkbox), so the
 * extension finds them exactly as it finds the real ones. The public test keys could not be used:
 * both providers answer "invalid site key" to them now. The stand-ins are stricter than the real
 * thing in one way: they tick ONLY on a trusted click that lands on the box itself.
 */
const MCP = `http://127.0.0.1:${E2E_PORT}/mcp`;

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

/** The checkbox frame: a 28px box where the real one sits; `?k=CHALLENGE` asks for pictures. */
const widgetFrame = (boxId: string) => `<style>body{margin:0;font:14px sans-serif}</style>
<span id="${boxId}" role="checkbox" aria-checked="false"
  style="position:absolute;left:13px;top:25px;width:28px;height:28px;border:2px solid #999"></span>
<span style="position:absolute;left:52px;top:30px">I'm not a robot</span>
<script>
  window.__untrusted = 0;
  const box = document.getElementById('${boxId}');
  box.addEventListener('click', (e) => {
    if (!e.isTrusted) { window.__untrusted++; return; }
    if (/CHALLENGE/.test(location.href)) { parent.postMessage('captcha:challenge', '*'); return; }
    box.setAttribute('aria-checked', 'true');
    parent.postMessage('captcha:token', '*');
  });
</script>`;

async function standInWidgets(context: BrowserContext) {
  await context.route('https://www.google.com/recaptcha/api2/anchor*', (r) =>
    r.fulfill({ contentType: 'text/html', body: widgetFrame('recaptcha-anchor') }),
  );
  await context.route('https://www.google.com/recaptcha/api2/bframe*', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<p>Select all images with traffic lights</p>' }),
  );
  await context.route('https://newassets.hcaptcha.com/captcha/v1/e2e/static/hcaptcha.html*', (r) =>
    r.fulfill({ contentType: 'text/html', body: widgetFrame('checkbox') }),
  );
}

/** What the page's own embed script does: answer the widget's messages. */
const HOST_SCRIPT = `<script>
  addEventListener('message', (e) => {
    if (e.data === 'captcha:token') document.querySelector('textarea').value = 'TOKEN';
    if (e.data === 'captcha:challenge') {
      const c = document.getElementById('challenge');
      c.style.visibility = 'visible';
      c.style.top = '10px';
    }
  });
</script>`;

const recaptcha = (key = 'KEY', size = 'normal') => `
<div class="g-recaptcha">
  <iframe title="reCAPTCHA" width="304" height="78" frameborder="0"
    src="https://www.google.com/recaptcha/api2/anchor?ar=1&k=${key}&hl=en&size=${size}"></iframe>
  <textarea id="g-recaptcha-response" style="display:none"></textarea>
</div>
<div id="challenge" style="visibility:hidden;position:absolute;top:-10000px;left:0">
  <iframe title="recaptcha challenge" width="400" height="580"
    src="https://www.google.com/recaptcha/api2/bframe?hl=en&k=${key}"></iframe>
</div>${HOST_SCRIPT}`;

const hcaptcha = `
<div class="h-captcha">
  <iframe title="Widget containing checkbox for hCaptcha security challenge" width="302" height="76"
    frameborder="0"
    src="https://newassets.hcaptcha.com/captcha/v1/e2e/static/hcaptcha.html#frame=checkbox&id=0e2e&host=x"></iframe>
  <textarea name="h-captcha-response" style="display:none"></textarea>
</div>${HOST_SCRIPT}`;

/** Counts what a person's hand would leave on the page itself: trusted moves and wheel turns. */
const SPY = `<script>
  window.__moves = 0; window.__wheels = 0; window.__untrusted = 0;
  addEventListener('mousemove', (e) => { e.isTrusted ? window.__moves++ : window.__untrusted++; }, true);
  addEventListener('wheel', (e) => { e.isTrusted ? window.__wheels++ : window.__untrusted++; }, true);
</script>`;

const FORM = (widget: string) => `${SPY}
<h1>Apply</h1>
<div style="height: 1800px">a long form</div>
<form>${widget}<button type="submit">Submit</button></form>
<div style="height: 600px"></div>`;

interface Spy {
  __moves: number;
  __wheels: number;
  __untrusted: number;
}

async function connected() {
  await expect
    .poll(async () => (await tool('autofill_status')).json().extensionConnected, {
      timeout: 30_000,
    })
    .toBe(true);
}

test.describe('ticks a visible "I\'m not a robot" box with a real mouse', () => {
  test.setTimeout(90_000);
  test.beforeEach(async ({ context }) => {
    await standInWidgets(context);
    await connected();
  });

  test('reCAPTCHA v2 below the fold: wheels down, moves there, ticks', async ({
    context,
    page,
  }) => {
    const url = 'https://apply.captcha-e2e.test/recaptcha';
    await serveFixture(context, url, FORM(recaptcha()));
    await page.goto(url);
    const anchor = page.frameLocator('iframe[title="reCAPTCHA"]').locator('#recaptcha-anchor');
    await expect(anchor).toHaveAttribute('aria-checked', 'false');

    const out = await tool('autofill_captcha', { url });
    expect(out.isError, out.text).toBe(false);
    expect(out.json(), out.text).toEqual({ status: 'solved', kind: 'recaptcha' });

    await expect(anchor).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#g-recaptcha-response')).toHaveValue('TOKEN');
    const seen = await page.evaluate(() => {
      const w = window as unknown as Spy;
      return { moves: w.__moves, wheels: w.__wheels, untrusted: w.__untrusted, y: scrollY };
    });
    expect(seen.wheels).toBeGreaterThan(3); // the box was ~1800px down: the wheel brought it in
    expect(seen.y).toBeGreaterThan(800);
    expect(seen.moves).toBeGreaterThan(5); // a path, not a teleport
    expect(seen.untrusted).toBe(0);

    // a second call leaves a ticked box alone
    expect((await tool('autofill_captcha', { url })).json()).toMatchObject({
      status: 'already-solved',
    });
  });

  test('hCaptcha inside an embedded, cross-origin application form', async ({ context, page }) => {
    await serveFixture(context, 'https://embed.captcha-e2e.test/form', FORM(hcaptcha));
    await serveFixture(
      context,
      'https://careers.captcha-e2e.test/job',
      `<h1>Careers</h1><div style="height: 300px"></div>
       <iframe src="https://embed.captcha-e2e.test/form"
         style="width: 700px; height: 2600px; border: 7px solid #ccc; padding: 5px"></iframe>`,
    );
    await page.goto('https://careers.captcha-e2e.test/job');
    const form = page.frameLocator('iframe[src*="embed.captcha-e2e.test"]');
    const box = form.frameLocator('iframe[src*="hcaptcha"]').locator('#checkbox');
    await expect(box).toHaveAttribute('aria-checked', 'false');

    const out = await tool('autofill_captcha', { url: 'https://careers.captcha-e2e.test/job' });
    expect(out.isError, out.text).toBe(false);
    expect(out.json(), out.text).toEqual({ status: 'solved', kind: 'hcaptcha' });
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(form.locator('[name="h-captcha-response"]')).toHaveValue('TOKEN');
  });

  test('a picture challenge stops it: reported, nothing clicked inside', async ({
    context,
    page,
  }) => {
    const url = 'https://apply.captcha-e2e.test/challenge';
    await serveFixture(context, url, FORM(recaptcha('CHALLENGE')));
    await page.goto(url);
    await expect(
      page.frameLocator('iframe[title="reCAPTCHA"]').locator('#recaptcha-anchor'),
    ).toBeVisible();

    const out = await tool('autofill_captcha', { url });
    expect(out.json(), out.text).toMatchObject({ status: 'challenge', kind: 'recaptcha' });
    await expect(page.locator('#g-recaptcha-response')).toHaveValue('');
    // asking again does not click into the open challenge
    expect((await tool('autofill_captcha', { url })).json()).toMatchObject({
      status: 'challenge',
    });
  });

  test('an invisible / v3 badge, or no captcha at all: nothing to tick, nothing touched', async ({
    context,
    page,
  }) => {
    for (const [path, html] of [
      ['/invisible', FORM(recaptcha('KEY', 'invisible'))],
      ['/plain', `${SPY}<form><input name="x"></form>`],
    ] as const) {
      const url = `https://apply.captcha-e2e.test${path}`;
      await serveFixture(context, url, html);
      await page.goto(url);
      const out = await tool('autofill_captcha', { url });
      expect(out.json(), out.text).toEqual({ status: 'none' });
      expect(await page.evaluate(() => (window as unknown as Spy).__moves)).toBe(0);
    }
  });
});
