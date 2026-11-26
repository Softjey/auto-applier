#!/usr/bin/env node
/**
 * HTML → PDF as one long page: the paper height equals the content height,
 * so the file has exactly one page and no break in the middle of the text.
 *
 *   node topdf.mjs out/CV_Acme.html              — → out/CV_Acme.pdf
 *   node topdf.mjs cv.html --out=resume.pdf      — custom path
 *   node topdf.mjs cv.html --width=210 --pad=8   — width and bottom padding, mm
 *   node topdf.mjs browsers                      — which browser will be used
 *
 * Drives a headless browser directly over the DevTools protocol (WebSocket is built into Node),
 * so there are no npm dependencies. Any Chromium on the system is enough.
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, relative, join, basename, extname } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');

/** Default page width, mm (A4 — what the base resume is laid out for). */
const WIDTH_MM = 210;
/** Bottom padding so the last line does not touch the edge, mm. */
const PAD_MM = 8;
/** How long to wait for the browser, ms. */
const TIMEOUT = 30_000;
const EXIT_TIMEOUT = 3_000;

const MM_PER_IN = 25.4;
const PX_PER_IN = 96;

// ─────────────────────────────────────────── finding a browser

/** Candidates in order of reliability: automation browsers first, then regular ones. */
function browserCandidates() {
  const home = homedir();
  const list = [];

  const fromCache = (root, ...tail) => {
    if (!existsSync(root)) return;
    for (const dir of readdirSync(root)) list.push(join(root, dir, ...tail));
  };
  // playwright / puppeteer caches: "Chrome for Testing" lives inside
  fromCache(join(home, 'Library/Caches/ms-playwright'), 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  fromCache(join(home, 'Library/Caches/ms-playwright'), 'chrome-mac', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  fromCache(join(home, '.cache/puppeteer/chrome'), 'chrome-mac-arm64', 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

  list.push(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Arc.app/Contents/MacOS/Arc',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  );
  return list;
}

function findBrowser(explicit) {
  const wanted = explicit
    ?? process.env.CHROME_PATH
    ?? process.env.PUPPETEER_EXECUTABLE_PATH;
  if (wanted) {
    const path = resolve(process.cwd(), wanted);
    if (!existsSync(path)) throw new Error(`browser not found: ${path}`);
    return path;
  }
  const found = browserCandidates().find((p) => existsSync(p));
  if (!found) {
    throw new Error('no Chromium found.\n'
      + 'Install Google Chrome or give a path: --browser=<path> or CHROME_PATH=<path>');
  }
  return found;
}

// ─────────────────────────────────────────── a tiny DevTools protocol client

/** Starts a headless browser and returns the ws address of its DevTools. */
function launch(binary, profileDir) {
  const child = spawn(binary, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--hide-scrollbars',
    '--disable-extensions',
    '--use-mock-keychain',
    '--run-all-compositor-stages-before-draw',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = new Promise((ok, fail) => {
    let stderr = '';
    const timer = setTimeout(() => fail(new Error(`browser did not answer within ${TIMEOUT} ms:\n${stderr.slice(-500)}`)), TIMEOUT);
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/ws:\/\/\S+/);
      if (match) { clearTimeout(timer); ok(match[0]); }
    });
    child.on('exit', (code) => { clearTimeout(timer); fail(new Error(`browser exited with code ${code}:\n${stderr.slice(-500)}`)); });
  });

  return { child, wsUrl };
}

function stopBrowser(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((ok) => {
    const timer = setTimeout(ok, EXIT_TIMEOUT);
    child.once('exit', () => { clearTimeout(timer); ok(); });
    child.kill();
  });
}

/** A WebSocket wrapper: send(method, params, sessionId) and waiting for events. */
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((ok, fail) => {
    socket.addEventListener('open', ok, { once: true });
    socket.addEventListener('error', () => fail(new Error(`could not connect to ${url}`)), { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  const waiters = [];

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined) {
      const slot = pending.get(message.id);
      if (!slot) return;
      pending.delete(message.id);
      if (message.error) slot.fail(new Error(`${slot.method}: ${message.error.message}`));
      else slot.ok(message.result);
      return;
    }
    for (const w of [...waiters]) {
      if (w.method === message.method && (!w.sessionId || w.sessionId === message.sessionId)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.ok(message.params);
      }
    }
  });

  socket.addEventListener('close', () => {
    for (const slot of pending.values()) slot.fail(new Error(`connection closed before ${slot.method} answered`));
    pending.clear();
  });

  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const id = (nextId += 1);
    const timer = setTimeout(() => {
      pending.delete(id);
      fail(new Error(`no answer to ${method} within ${TIMEOUT} ms`));
    }, TIMEOUT);
    pending.set(id, {
      ok: (result) => { clearTimeout(timer); ok(result); },
      fail: (error) => { clearTimeout(timer); fail(error); },
      method,
    });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const once = (method, sessionId) => new Promise((ok, fail) => {
    const waiter = { method, sessionId, ok: (params) => { clearTimeout(waiter.timer); ok(params); } };
    waiter.timer = setTimeout(() => {
      if (waiters.includes(waiter)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        fail(new Error(`timed out waiting for event ${method}`));
      }
    }, TIMEOUT);
    waiters.push(waiter);
  });

  return { send, once, close: () => socket.close() };
}

/** How many page objects the finished PDF has (Chromium writes them as plain text). */
function countPages(buffer) {
  const matches = buffer.toString('latin1').match(/\/Type\s*\/Page[^s]/g);
  return matches ? matches.length : null;
}

// ─────────────────────────────────────────── the render itself

/**
 * Side margins live in the html itself (the Google Docs export gives body a padding of 57.6pt
 * and a max-width of 480.1pt). --side overrides them while printing without touching the file:
 * max-width is dropped, otherwise the text column would keep its old width.
 */
const sideStyle = (sideMm) => `body{max-width:none !important;`
  + `padding-left:${sideMm}mm !important;padding-right:${sideMm}mm !important}`;

async function renderPdf(htmlPath, { binary, widthMm, padMm, scale, sideMm }) {
  const profileDir = mkdtempSync(join(tmpdir(), 'resume-pdf-'));
  const { child, wsUrl } = launch(binary, profileDir);
  let cdp;

  try {
    cdp = await connect(await wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);

    const widthPx = Math.round((widthMm / MM_PER_IN) * PX_PER_IN);
    await page('Page.enable');
    // viewport width = paper width, so the measured height matches the printed one;
    // the height is minimal, otherwise scrollHeight would never be smaller than the viewport
    await page('Emulation.setDeviceMetricsOverride', { width: widthPx, height: 20, deviceScaleFactor: 1, mobile: false });
    await page('Emulation.setEmulatedMedia', { media: 'print' });

    const loaded = cdp.once('Page.loadEventFired', sessionId);
    await page('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await loaded;

    if (sideMm !== null) {
      await page('Runtime.evaluate', {
        expression: `(() => {
          const style = document.createElement('style');
          style.textContent = ${JSON.stringify(sideStyle(sideMm))};
          document.head.appendChild(style);
        })()`,
      });
    }

    const measured = await page('Runtime.evaluate', {
      expression: `(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const d = document.documentElement, b = document.body;
        return Math.ceil(Math.max(
          d.scrollHeight, b.scrollHeight,
          d.getBoundingClientRect().bottom, b.getBoundingClientRect().bottom,
        ));
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (measured.exceptionDetails) throw new Error(`could not measure the height: ${measured.exceptionDetails.text}`);
    const contentPx = measured.result.value;

    const heightIn = contentPx / PX_PER_IN + padMm / MM_PER_IN;
    const { data } = await page('Page.printToPDF', {
      paperWidth: widthMm / MM_PER_IN,
      paperHeight: heightIn,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      printBackground: true,
      preferCSSPageSize: false,
      scale,
    });

    return {
      buffer: Buffer.from(data, 'base64'),
      contentPx,
      heightMm: heightIn * MM_PER_IN,
    };
  } finally {
    try { await cdp?.send('Browser.close'); } catch { /* the browser may already be gone */ }
    cdp?.close();
    await stopBrowser(child);
    try {
      rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }
}

// ─────────────────────────────────────────── main

const USAGE = `Usage:
  node topdf.mjs out/CV_Acme.html             html → pdf next to it, one long page
  node topdf.mjs cv.html --out=resume.pdf     custom path
  node topdf.mjs cv.html --width=210 --pad=8  page width and bottom padding, mm
  node topdf.mjs cv.html --side=14            side margins, mm (default — as in the html)
  node topdf.mjs cv.html --scale=0.95         content scale
  node topdf.mjs browsers                     which Chromium will be used
Flags: --browser=<path> (or CHROME_PATH) --force`;

async function main(argv) {
  const args = argv.slice(2);
  const flags = new Map(args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v = 'true'] = a.slice(2).split('=');
    return [k, v];
  }));
  const positional = args.filter((a) => !a.startsWith('--'));

  if (flags.has('help') || positional.length === 0) { console.log(USAGE); process.exit(flags.has('help') ? 0 : 2); }

  if (positional[0] === 'browsers') {
    const found = browserCandidates().filter((p) => existsSync(p));
    console.log(found.length ? `Will use:\n  ${found[0]}` : 'Chromium not found');
    if (found.length > 1) console.log(`Also found:\n${found.slice(1).map((p) => `  ${p}`).join('\n')}`);
    return;
  }

  const htmlPath = resolve(process.cwd(), positional[0]);
  if (!existsSync(htmlPath)) { console.error(`no such file: ${positional[0]}`); process.exit(2); }

  const target = flags.has('out')
    ? resolve(process.cwd(), flags.get('out'))
    : join(dirname(htmlPath), `${basename(htmlPath, extname(htmlPath))}.pdf`);
  if (existsSync(target) && !flags.has('force')) {
    console.error(`${relative(ROOT, target)} already exists — add --force to overwrite`);
    process.exit(1);
  }

  const binary = findBrowser(flags.get('browser'));
  const { buffer, contentPx, heightMm } = await renderPdf(htmlPath, {
    binary,
    widthMm: Number(flags.get('width') ?? WIDTH_MM),
    padMm: Number(flags.get('pad') ?? PAD_MM),
    scale: Number(flags.get('scale') ?? 1),
    sideMm: flags.has('side') ? Number(flags.get('side')) : null,
  });

  writeFileSync(target, buffer);

  const pages = countPages(buffer);
  console.log(`${relative(ROOT, target)}`);
  console.log(`  page: ${Math.round(Number(flags.get('width') ?? WIDTH_MM))}×${Math.round(heightMm)} mm (content ${contentPx}px)`);
  console.log(`  size: ${(buffer.length / 1024).toFixed(0)} KB`);
  if (pages !== null && pages !== 1) {
    console.error(`  WARNING: the file has ${pages} pages — the height was measured imprecisely, try another --pad`);
    process.exit(1);
  }
}

main(process.argv).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
