import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRIPT = join(ROOT, '.claude/skills/resume-pdf/topdf.mjs');
const PERSONA_CV = join(ROOT, 'fixtures/persona/CV_Base.html');

let dir;
const run = (args, env = {}) => spawnSync(process.execPath, [SCRIPT, ...args], {
  encoding: 'utf8', cwd: dir, env: { ...process.env, CHROME_PATH: '', PUPPETEER_EXECUTABLE_PATH: '', ...env }, timeout: 60_000,
});

const browserFound = !/Chromium not found/.test(
  spawnSync(process.execPath, [SCRIPT, 'browsers'], { encoding: 'utf8' }).stdout,
);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'topdf-'));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('topdf.mjs command line', () => {
  it('prints usage and exits 2 without a file', () => {
    const r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /Usage/);
  });

  it('exits 2 for a file that does not exist', () => {
    const r = run(['missing.html']);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no such file: missing\.html/);
  });

  it('refuses to overwrite an existing pdf without --force', () => {
    writeFileSync(join(dir, 'cv.html'), '<html><body>x</body></html>');
    writeFileSync(join(dir, 'cv.pdf'), 'old');
    const r = run(['cv.html']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /already exists — add --force/);
    assert.equal(readFileSync(join(dir, 'cv.pdf'), 'utf8'), 'old');
  });

  it('names the path when an explicit browser does not exist', () => {
    writeFileSync(join(dir, 'b.html'), '<html><body>x</body></html>');
    const r = run(['b.html', '--browser=/nonexistent/chrome']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /browser not found: \/nonexistent\/chrome/);
  });

  it('takes the browser from CHROME_PATH', () => {
    writeFileSync(join(dir, 'c.html'), '<html><body>x</body></html>');
    const r = run(['c.html'], { CHROME_PATH: '/nonexistent/from-env' });
    assert.match(r.stderr, /browser not found: \/nonexistent\/from-env/);
  });
});

describe.skipIf(!browserFound)('topdf.mjs with a real browser', () => {
  it('prints a resume as a single page next to the html', () => {
    copyFileSync(PERSONA_CV, join(dir, 'Daniel_Nowak_CV.html'));
    const r = run(['Daniel_Nowak_CV.html']);
    assert.equal(r.status, 0, r.stderr);
    const pdf = readFileSync(join(dir, 'Daniel_Nowak_CV.pdf'));
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length, 1);
  });

  it('writes to --out and overwrites with --force', () => {
    copyFileSync(PERSONA_CV, join(dir, 'cv2.html'));
    assert.equal(run(['cv2.html', '--out=custom.pdf']).status, 0);
    assert.ok(existsSync(join(dir, 'custom.pdf')));
    assert.equal(run(['cv2.html', '--out=custom.pdf']).status, 1);
    assert.equal(run(['cv2.html', '--out=custom.pdf', '--force']).status, 0);
  });
}, 120_000);
