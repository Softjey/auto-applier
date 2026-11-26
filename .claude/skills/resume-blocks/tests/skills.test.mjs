import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRIPT = join(ROOT, '.claude/skills/resume-blocks/skills.mjs');

const CSV = [
  'section,skill,rating,already_seen',
  'Languages,JavaScript,5,',
  'Languages,TypeScript,5,',
  'Frontend,React,5,',
  'Frontend,Next.js,5,',
  'Frontend,Vue.js,3,',
  'Frontend,Angular,2,',
  'Frontend,"TanStack Query / React Query",4,',
  'Frontend,Remix,,',
  'Backend,Node.js,5,',
  'Backend,REST API,4,',
  'Backend,"CI/CD",4,',
  'Cloud,GCP,3,',
  'Cloud,Azure,1,',
  'Cloud,Kubernetes,0,',
  'Practices,Design Systems,5,',
  'Practices,System Design,3,',
].join('\n');

let dir;
let csvPath;

const cli = (args, input) => spawnSync(process.execPath, [SCRIPT, ...args, `--csv=${csvPath}`], { encoding: 'utf8', input, cwd: dir });
const json = (args, input) => {
  const r = cli([...args, '--json'], input);
  return { code: r.status, body: JSON.parse(r.stdout), stderr: r.stderr };
};
const rateOne = (term) => json(['rate', term]).body[0];

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'skills-'));
  csvPath = join(dir, 'skills.csv');
  writeFileSync(csvPath, CSV);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('rate verdicts', () => {
  const cases = [
    ['React', 'React', 5, 'core'],
    ['Vue.js', 'Vue.js', 3, 'support'],
    ['Angular', 'Angular', 2, 'tail'],
    ['Azure', 'Azure', 1, 'weak'],
    ['Kubernetes', 'Kubernetes', 0, 'weak'],
    ['Remix', 'Remix', null, 'unrated'],
  ];
  for (const [term, match, rating, verdict] of cases) {
    it(`${term} → ${verdict}`, () => {
      assert.deepEqual((({ match: m, rating: r, verdict: v }) => ({ match: m, rating: r, verdict: v }))(rateOne(term)), { match, rating, verdict });
    });
  }

  it('a term with no close row is missing, not guessed', () => {
    assert.equal(rateOne('Rust').verdict, 'missing');
    assert.equal(rateOne('Rust').match, null);
  });

  it('spelling variants resolve to the base row', () => {
    assert.equal(rateOne('NextJS').match, 'Next.js');
    assert.equal(rateOne('Node').match, 'Node.js');
    assert.equal(rateOne('REST').match, 'REST API');
  });

  it('one of several spellings in a row matches it', () => {
    assert.equal(rateOne('React Query').match, 'TanStack Query / React Query');
  });

  it('words in a different order are not a confident match', () => {
    const r = rateOne('Design System Architecture');
    assert.notEqual(r.match, 'System Design');
  });

  it('reads terms from stdin when none are given as arguments', () => {
    const r = json(['rate'], 'React\nAzure\n');
    assert.deepEqual(r.body.map((x) => x.verdict), ['core', 'weak']);
  });
});

describe('search and list', () => {
  it('search finds how the base names a skill', () => {
    assert.ok(json(['search', 'react query']).body.some((s) => s.name === 'TanStack Query / React Query'));
  });

  it('list filters by rating and text', () => {
    assert.deepEqual(json(['list', '--min=5', '--grep=script']).body.map((s) => s.name), ['JavaScript', 'TypeScript']);
    assert.deepEqual(json(['list', '--max=1']).body.map((s) => s.name), ['Azure', 'Kubernetes']);
  });

  it('list skips unrated rows when a rating bound is set', () => {
    assert.ok(!json(['list', '--max=5']).body.some((s) => s.name === 'Remix'));
  });
});

describe('check', () => {
  const draft = (text) => {
    const p = join(dir, `draft-${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(p, text);
    return p;
  };

  it('passes a complete block with weak skills at the tail', () => {
    const p = draft('Frontend: React, Next.js, Vue.js, Angular\nBackend: Node.js, REST API, CI/CD');
    const r = json(['check', p, 'React', 'Vue.js', 'Angular', 'Node.js']);
    assert.equal(r.code, 0);
    assert.deepEqual([r.body.missing, r.body.forbidden, r.body.misplaced, r.body.weakNotRequired], [[], [], [], []]);
  });

  it('reports a required skill rated 3+ that the block forgot', () => {
    const p = draft('Frontend: React, Next.js');
    const r = json(['check', p, 'React', 'Vue.js']);
    assert.equal(r.code, 1);
    assert.deepEqual(r.body.missing.map((s) => s.name), ['Vue.js']);
  });

  it('a rating-2 requirement is optional, not missing', () => {
    const r = json(['check', draft('Frontend: React, Next.js'), 'React', 'Angular']);
    assert.equal(r.code, 0);
    assert.deepEqual(r.body.optionalMissing.map((s) => s.name), ['Angular']);
  });

  it('flags skills rated below 2 or unrated as forbidden', () => {
    const r = json(['check', draft('Cloud: GCP, Azure\nFrontend: React, Remix'), 'GCP']);
    assert.equal(r.code, 1);
    assert.deepEqual(r.body.forbidden.map((s) => s.name).sort(), ['Azure', 'Remix']);
  });

  it('flags a rating-2 skill placed before a stronger one on its line', () => {
    const r = json(['check', draft('Frontend: Angular, React, Next.js'), 'React', 'Angular']);
    assert.deepEqual(r.body.misplaced.map((s) => s.term), ['Angular']);
  });

  it('flags a rating-2 skill the vacancy did not ask for', () => {
    const r = json(['check', draft('Frontend: React, Next.js, Angular'), 'React']);
    assert.deepEqual(r.body.weakNotRequired.map((s) => s.name), ['Angular']);
  });

  it('keeps CI/CD whole and splits an unknown slash pair', () => {
    const r = json(['check', draft('Backend: CI/CD, Node.js\nFrontend: React/Vue.js'), 'React']);
    assert.ok(!r.body.unknown.includes('CI') && !r.body.unknown.includes('CD'));
    assert.ok(!r.body.unknown.includes('React/Vue.js'));
  });

  it('reads items inside parentheses', () => {
    const r = json(['check', draft('Backend: Node.js (REST API), CI/CD'), 'REST API']);
    assert.deepEqual(r.body.missing, []);
  });
});

describe('command line', () => {
  it('fails on a csv without skill and rating columns', () => {
    const bad = join(dir, 'bad.csv');
    writeFileSync(bad, 'name,score\nReact,5');
    const r = spawnSync(process.execPath, [SCRIPT, 'rate', 'React', `--csv=${bad}`], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no skill\/rating columns/);
  });

  it('prints usage and exits 2 for an unknown command', () => {
    assert.equal(cli(['frobnicate']).status, 2);
  });
});
