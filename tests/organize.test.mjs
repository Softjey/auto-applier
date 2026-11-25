import { describe, it, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAllVacancyFolders, findVacancyFolders } from '../.claude/skills/organize-by-status/find-vacancy-folders.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, '.claude/skills/organize-by-status/organize.mjs');

const ID_A = 'cmvphewsn000y0doh6zit7uhr';
const ID_B = 'cmwamhix10m7rom0f8yrjnjqm';

let out;

const vacancy = (...parts) => {
  const dir = join(out, ...parts);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Daniel_Nowak_CV.html'), '<html></html>');
  return dir;
};

const run = (map, ...flags) => {
  const mapPath = join(out, '..', 'mapping.json');
  writeFileSync(mapPath, JSON.stringify(map));
  const r = spawnSync(process.execPath, [SCRIPT, `--map=${mapPath}`, `--dir=${out}`, ...flags], { encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
};

beforeEach(() => {
  out = join(mkdtempSync(join(tmpdir(), 'organize-')), 'out');
  mkdirSync(out);
});

afterEach(() => {
  rmSync(dirname(out), { recursive: true, force: true });
});

describe('findVacancyFolders', () => {
  it('treats a folder with files as a vacancy leaf', () => {
    const dir = vacancy(`Acme_${ID_A}-Senior-Frontend-Engineer`);
    assert.deepEqual(findVacancyFolders(dir), [{ folder: `Acme_${ID_A}-Senior-Frontend-Engineer`, src: dir }]);
  });

  it('recurses into status containers that hold only folders', () => {
    vacancy('Loose-Frontend-Developer');
    vacancy('APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`);
    vacancy('SAVED', `Beta_${ID_B}-Fullstack-Engineer`);
    const names = findAllVacancyFolders(out).map((f) => f.folder).sort();
    assert.deepEqual(names, [`Acme_${ID_A}-Senior-Frontend-Engineer`, `Beta_${ID_B}-Fullstack-Engineer`, 'Loose-Frontend-Developer']);
  });

  it('counts an empty folder as a leaf, not a container', () => {
    mkdirSync(join(out, 'Empty-Role'));
    assert.deepEqual(findAllVacancyFolders(out).map((f) => f.folder), ['Empty-Role']);
  });

  it('ignores loose files at the top of out/', () => {
    writeFileSync(join(out, 'notes.md'), 'x');
    assert.deepEqual(findAllVacancyFolders(out), []);
  });
});

describe('organize.mjs', () => {
  it('is a dry run without --apply', () => {
    const src = vacancy(`Acme_${ID_A}-Senior-Frontend-Engineer`);
    const r = run({ byId: { [ID_A]: 'APPLIED' } });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /Dry run only/);
    assert.ok(existsSync(src));
    assert.ok(!existsSync(join(out, 'APPLIED')));
  });

  it('moves by vacancy id and by exact folder name with --apply', () => {
    vacancy(`Acme_${ID_A}-Senior-Frontend-Engineer`);
    vacancy('Custom-Frontend-Developer');
    const r = run({ byId: { [ID_A]: 'APPLIED' }, byFolder: { 'Custom-Frontend-Developer': 'saved' } }, '--apply');
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(out, 'APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`, 'Daniel_Nowak_CV.html')));
    assert.ok(existsSync(join(out, 'SAVED', 'Custom-Frontend-Developer')));
  });

  it('byFolder wins over byId', () => {
    vacancy(`Acme_${ID_A}-Senior-Frontend-Engineer`);
    run({ byId: { [ID_A]: 'APPLIED' }, byFolder: { [`Acme_${ID_A}-Senior-Frontend-Engineer`]: 'REJECTED' } }, '--apply');
    assert.ok(existsSync(join(out, 'REJECTED', `Acme_${ID_A}-Senior-Frontend-Engineer`)));
  });

  it('moves an already sorted folder when its status changed and removes the emptied status folder', () => {
    vacancy('SAVED', `Acme_${ID_A}-Senior-Frontend-Engineer`);
    const r = run({ byId: { [ID_A]: 'APPLIED' } }, '--apply');
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(out, 'APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`)));
    assert.ok(!existsSync(join(out, 'SAVED')));
  });

  it('leaves a folder alone when it is already in the right place', () => {
    vacancy('APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`);
    const r = run({ byId: { [ID_A]: 'APPLIED' } }, '--apply');
    assert.match(r.stdout, /already organized: 1/);
    assert.match(r.stdout, /Moved 0 folder/);
  });

  it('never overwrites an existing destination', () => {
    const src = vacancy(`Acme_${ID_A}-Senior-Frontend-Engineer`);
    vacancy('APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`);
    writeFileSync(join(out, 'APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`, 'keep.txt'), 'original');
    const r = run({ byId: { [ID_A]: 'APPLIED' } }, '--apply');
    assert.match(r.stdout, /conflicts \(kept\):\s+1/);
    assert.ok(existsSync(src));
    assert.equal(readFileSync(join(out, 'APPLIED', `Acme_${ID_A}-Senior-Frontend-Engineer`, 'keep.txt'), 'utf8'), 'original');
  });

  it('leaves unmatched folders in place and reports them', () => {
    const src = vacancy('Unknown-Role');
    const report = join(out, '..', 'report.json');
    const r = run({ byId: {} }, '--apply', `--report=${report}`);
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(src));
    assert.deepEqual(JSON.parse(readFileSync(report, 'utf8')).unmatched, ['Unknown-Role']);
  });

  it('normalises a status into a folder name', () => {
    vacancy(`Acme_${ID_A}-Senior-Frontend-Engineer`);
    run({ byId: { [ID_A]: ' not interested ' } }, '--apply');
    assert.ok(existsSync(join(out, 'NOT_INTERESTED', `Acme_${ID_A}-Senior-Frontend-Engineer`)));
  });

  it('refuses to run without a mapping', () => {
    const r = spawnSync(process.execPath, [SCRIPT, `--dir=${out}`], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /--map=<mapping.json> is required/);
  });
});
