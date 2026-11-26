#!/usr/bin/env node
/**
 * Assembles a finished resume: a copy of CV_Base.html with its placeholders replaced
 * by the Title / Summary / Skills blocks. It decides nothing and edits no text —
 * it only inserts what it is given and makes sure no placeholder is left.
 *
 *   node render.mjs blocks.md                     — → data/out/<Position>/<resumeFileName>.html
 *   node render.mjs blocks.md --company="Acme"    — company in the vacancy folder name
 *   node render.mjs blocks.md --out=cv.html       — custom path (- = stdout)
 *   node render.mjs placeholders                  — which placeholders the base has
 *
 * Flags: --base=<path to the base html>, --force (overwrite an existing file)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const DEFAULT_BASE = resolve(ROOT, 'data/CV_Base.html');
const DEFAULT_OUT_DIR = resolve(ROOT, 'data/out');

/** Placeholders of the base resume. Key — block section, value — the bracketed text. */
export const PLACEHOLDERS = {
  title: '[Position placeholder]',
  summary: '[Summary placeholder]',
  skills: '[skills placeholder]',
};

// ─────────────────────────────────────────── parsing blocks

const SECTIONS = ['title', 'summary', 'skills'];
/** "**Title:** ...", "Title: ...", "## Skills" — each of these starts a section. */
const HEADER = new RegExp(`^\\s*#*\\s*[*_]*\\s*(${SECTIONS.join('|')})\\s*[*_]*\\s*:?\\s*(.*)$`, 'i');

const stripMd = (s) => s.replace(/[*_`]/g, '').trim();

/**
 * Reads the output of the resume-blocks skill as is:
 *
 *   **Title:** Senior Frontend Developer
 *   **Summary:** ...sentences...
 *   **Skills:**
 *   Frontend: React, Next.js, TypeScript
 *   Backend & Data: Node.js (NestJS), GraphQL
 *
 * Anything after the skills block that does not look like a "Category: items" line
 * is treated as the agent's commentary and ignored.
 */
export function parseBlocks(text) {
  const found = { title: [], summary: [], skills: [] };
  let current = null;

  for (const raw of text.split(/\r?\n/)) {
    const header = raw.match(HEADER);
    if (header) {
      current = header[1].toLowerCase();
      const inline = stripMd(header[2]);
      if (inline) found[current].push(inline);
      continue;
    }
    if (!current) continue;

    const line = stripMd(raw);
    if (line === '') {
      // an empty line closes a section; in skills — only once lines have started,
      // since an empty line between "**Skills:**" and the first category is perfectly normal
      if (current !== 'skills' || found.skills.length > 0) current = null;
      continue;
    }
    if (current === 'skills' && !line.includes(':')) {
      current = null; // prose after the block — not ours to parse
      continue;
    }
    found[current].push(line);
  }

  const skills = found.skills.map((line) => {
    const colon = line.indexOf(':');
    return { category: line.slice(0, colon).trim(), items: line.slice(colon + 1).trim() };
  }).filter((s) => s.category !== '' && s.items !== '');

  return {
    title: found.title.join(' ').trim(),
    summary: found.summary.join(' ').replace(/\s+/g, ' ').trim(),
    skills,
  };
}

export function validate(blocks) {
  const problems = [];
  if (!blocks.title) problems.push('no Title section');
  if (!blocks.summary) problems.push('no Summary section');
  if (blocks.skills.length === 0) problems.push('no "Category: items" line in Skills');
  if (blocks.title.includes('\n') || blocks.title.length > 80) problems.push('Title must be one short line');
  return problems;
}

// ─────────────────────────────────────────── inserting into html

export const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const tokenPattern = (token) => new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const stripTags = (html) => html.replace(/<[^>]*>/g, '');
const plainText = (html) => stripTags(html).replace(/&nbsp;| /g, ' ').trim();

export function locate(html, token) {
  const at = html.search(tokenPattern(token));
  if (at !== -1) return at;
  if (tokenPattern(token).test(stripTags(html))) {
    throw new Error(`${token} is split by formatting in the base — delete it and type it again in one go`);
  }
  throw new Error(`the base has no placeholder ${token}`);
}

const LINE_TAGS = ['p', 'li'];
const STRUCTURE_TAGS = /<\/?(p|li|ul|ol|table|tbody|thead|tr|td|th|div|h[1-6])\b/i;

export function skillsLine(html, at, token) {
  const opening = [...html.slice(0, at).matchAll(/<(p|li)(?:\s[^>]*)?>/gi)].at(-1);
  const misplaced = new Error(`${token} must sit alone on its own line — a plain paragraph or a list item, not inside a table and not next to other text`);
  if (!opening) throw misplaced;
  const tag = opening[1].toLowerCase();
  const closing = `</${tag}>`;
  const close = html.toLowerCase().indexOf(closing, at);
  if (close === -1) throw misplaced;
  const start = opening.index;
  const end = close + closing.length;
  const line = html.slice(start, end);
  const inner = line.slice(opening[0].length, line.length - closing.length);
  if (STRUCTURE_TAGS.test(inner) || plainText(line).toLowerCase() !== token.toLowerCase()) throw misplaced;
  return { start, end, line };
}

export function renderSkills(skills, line, token) {
  return skills
    .map(({ category, items }) => line.replace(tokenPattern(token), () => `<span style="font-weight:700">${escapeHtml(category)}</span>`
      + `<span style="font-weight:400">: ${escapeHtml(items)}</span>`))
    .join('');
}

export function countTags(html) {
  const counts = new Map();
  for (const [, slash, name] of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    const key = `${slash ? '/' : ''}${name.toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function checkStructure(before, line, after, lines) {
  const base = countTags(before);
  const copy = countTags(line);
  const result = countTags(after);
  const keys = new Set([...base.keys(), ...copy.keys(), ...result.keys()]);
  const problems = [];
  for (const key of keys) {
    const extraSpans = key === 'span' || key === '/span' ? 2 * lines : 0;
    const expected = (base.get(key) ?? 0) + (lines - 1) * (copy.get(key) ?? 0) + extraSpans;
    if ((result.get(key) ?? 0) !== expected) problems.push(`<${key}> ${result.get(key) ?? 0} instead of ${expected}`);
  }
  for (const tag of [...LINE_TAGS, 'span']) {
    if ((result.get(tag) ?? 0) !== (result.get(`/${tag}`) ?? 0)) problems.push(`<${tag}> opened ${result.get(tag) ?? 0} times, closed ${result.get(`/${tag}`) ?? 0}`);
  }
  if (problems.length) throw new Error(`the assembled resume does not match the base's structure, nothing was written: ${problems.join('; ')}`);
}

export function fill(base, blocks) {
  let html = base;

  for (const key of ['title', 'summary']) {
    const token = PLACEHOLDERS[key];
    locate(html, token);
    html = html.replace(tokenPattern(token), () => escapeHtml(blocks[key]));
  }

  const token = PLACEHOLDERS.skills;
  const { start, end, line } = skillsLine(html, locate(html, token), token);
  const result = html.slice(0, start) + renderSkills(blocks.skills, line, token) + html.slice(end);
  checkStructure(html, line, result, blocks.skills.length);

  const left = result.match(/\[[^\]]*placeholder[^\]]*\]/gi);
  if (left) throw new Error(`placeholders left in the result: ${[...new Set(left)].join(', ')}`);

  return result;
}

// ─────────────────────────────────────────── file name

export const slug = (s) => s
  .normalize('NFKD')
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 60);

/**
 * The file always has the same name — it is what a recruiter sees in their downloads.
 * A leading "!" keeps it at the top of a Finder listing.
 */
const CONFIG_PATH = resolve(ROOT, 'data/resume-config.json');
const DEFAULT_CV_NAME = 'CV';

export function readCvName(configPath = CONFIG_PATH) {
  if (!existsSync(configPath)) return DEFAULT_CV_NAME;
  const { resumeFileName } = JSON.parse(readFileSync(configPath, 'utf8'));
  return resumeFileName ? resumeFileName.replace(/\.pdf$/i, '') : DEFAULT_CV_NAME;
}

const CV_NAME = readCvName();

/** data/out/<Company>-<Position>/<resumeFileName>.html — the vacancy goes in the folder, not the file name. */
export function outputPath(blocks, flags) {
  if (flags.has('out')) {
    const value = flags.get('out');
    return value === '-' ? '-' : resolve(process.cwd(), value);
  }
  const company = flags.get('company');
  const folder = [company && slug(company), slug(blocks.title)].filter(Boolean).join('-');
  return resolve(DEFAULT_OUT_DIR, folder, `${CV_NAME}.html`);
}

// ─────────────────────────────────────────── main

const USAGE = `Usage:
  node render.mjs blocks.md                    blocks from a file (or "-" / stdin)
  node render.mjs blocks.md --company="Acme"   → data/out/Acme-<Position>/${CV_NAME}.html
  node render.mjs blocks.md --out=cv.html      custom path; --out=- prints the html to stdout
  node render.mjs placeholders                 show the placeholders of the base resume
Flags: --base=<path> --force

Blocks file format — the resume-blocks skill output as is:
  **Title:** Senior Frontend Developer
  **Summary:** ...
  **Skills:**
  Frontend: React, Next.js, TypeScript`;

function main(argv) {
  const args = argv.slice(2);
  const flags = new Map(args.filter((a) => a.startsWith('--')).map((a) => {
    const [k, v = 'true'] = a.slice(2).split('=');
    return [k, v];
  }));
  const positional = args.filter((a) => !a.startsWith('--'));

  if (flags.has('help')) { console.log(USAGE); return; }

  const basePath = flags.has('base') ? resolve(process.cwd(), flags.get('base')) : DEFAULT_BASE;
  const base = readFileSync(basePath, 'utf8');

  if (positional[0] === 'placeholders') {
    const found = base.match(/\[[^\]]*placeholder[^\]]*\]/gi) ?? [];
    const lower = (s) => s.toLowerCase();
    const known = new Set(Object.values(PLACEHOLDERS).map(lower));
    const foundLower = found.map(lower);
    console.log(`${relative(ROOT, basePath)}:`);
    for (const p of found) console.log(`  ${p}${known.has(lower(p)) ? '' : '  ← the script does not fill it'}`);
    for (const [key, token] of Object.entries(PLACEHOLDERS)) {
      if (!foundLower.includes(lower(token))) console.log(`  MISSING ${token} (section ${key})`);
    }
    return;
  }

  const source = positional[0] && positional[0] !== '-' ? resolve(process.cwd(), positional[0]) : 0;
  const text = readFileSync(source, 'utf8');
  const blocks = parseBlocks(text);

  const problems = validate(blocks);
  if (problems.length) {
    console.error(`Blocks were read incompletely:\n${problems.map((p) => `- ${p}`).join('\n')}\n\n${USAGE}`);
    process.exit(2);
  }

  const html = fill(base, blocks);
  const target = outputPath(blocks, flags);

  if (target === '-') { process.stdout.write(html); return; }
  if (existsSync(target) && !flags.has('force')) {
    console.error(`${relative(ROOT, target)} already exists — add --force to overwrite`);
    process.exit(1);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html, 'utf8');

  console.log(`${relative(ROOT, target)}`);
  console.log(`  Title:   ${blocks.title}`);
  console.log(`  Summary: ${blocks.summary.split(' ').length} words`);
  console.log(`  Skills:  ${blocks.skills.length} lines, ${blocks.skills.reduce((n, s) => n + s.items.split(',').length, 0)} items`);
}

const invokedDirectly = process.argv[1] !== undefined && existsSync(process.argv[1])
  && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main(process.argv);
