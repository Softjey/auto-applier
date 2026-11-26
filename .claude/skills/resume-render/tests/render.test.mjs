import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLACEHOLDERS, checkStructure, escapeHtml, fill, locate, outputPath, parseBlocks,
  readCvName, renderSkills, skillsLine, slug, validate,
} from '../.claude/skills/resume-render/render.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SCRIPT = join(ROOT, '.claude/skills/resume-render/render.mjs');
const EXAMPLE_BASE = join(ROOT, 'templates/data-repo/CV_Base.example.html');

const HEAD = '<html><head><style>.a{font-weight:700}.b{font-size:10pt}</style></head><body>'
  + '<p class="t"><span class="a">Jane Doe - [Position placeholder]</span></p>'
  + '<p class="s"><span class="b">[Summary placeholder]</span></p>'
  + '<p class="h"><span class="a">SKILLS</span></p>';
const TAIL = '<p class="h"><span class="a">EDUCATION</span></p></body></html>';
const page = (skillsMarkup) => `${HEAD}${skillsMarkup}${TAIL}`;

const BLOCKS = {
  title: 'Senior Frontend Engineer',
  summary: 'Senior Frontend Engineer specializing in React & TypeScript.',
  skills: [
    { category: 'Frontend', items: 'React, Next.js' },
    { category: 'Backend & Data', items: 'Node.js, <PostgreSQL>' },
  ],
};

const BLOCKS_MD = `**Title:** ${BLOCKS.title}

**Summary:** ${BLOCKS.summary}

**Skills:**
Frontend: React, Next.js
Backend & Data: Node.js, <PostgreSQL>
`;

const withTitleAndSummary = (html) => html
  .replace(PLACEHOLDERS.title, escapeHtml(BLOCKS.title))
  .replace(PLACEHOLDERS.summary, escapeHtml(BLOCKS.summary));

const tempDir = () => mkdtempSync(join(tmpdir(), 'render-test-'));

describe('parseBlocks + validate', () => {
  it('reads the resume-blocks output and ignores the notes after the skills block', () => {
    const blocks = parseBlocks(`${BLOCKS_MD}\nAdded beyond the vacancy: Redux.\nLeft out: Kubernetes (1).\n`);
    assert.equal(blocks.title, BLOCKS.title);
    assert.equal(blocks.summary, BLOCKS.summary);
    assert.deepEqual(blocks.skills, BLOCKS.skills);
    assert.deepEqual(validate(blocks), []);
  });

  it('accepts plain and heading headers, a multi-line summary and a blank line before the first category', () => {
    const blocks = parseBlocks([
      '## Title', 'Senior Full Stack Engineer', '',
      'Summary: Senior Full Stack Engineer specializing in React,', 'building web applications.', '',
      'Skills:', '', 'Frontend: React', 'Some prose after the block.', 'Notes: not a skill line',
    ].join('\n'));
    assert.equal(blocks.title, 'Senior Full Stack Engineer');
    assert.equal(blocks.summary, 'Senior Full Stack Engineer specializing in React, building web applications.');
    assert.deepEqual(blocks.skills, [{ category: 'Frontend', items: 'React' }]);
  });

  it('reports what is missing or malformed', () => {
    assert.deepEqual(validate(parseBlocks('**Title:** Engineer\n\n**Skills:**\nFrontend: React\n')), ['no Summary section']);
    assert.deepEqual(validate(parseBlocks('**Title:** Engineer\n\n**Summary:** Text.\n')), ['no "Category: items" line in Skills']);
    assert.ok(validate({ title: 'x'.repeat(81), summary: 's', skills: [{ category: 'c', items: 'i' }] })
      .includes('Title must be one short line'));
  });
});

describe('locate', () => {
  it('finds a placeholder regardless of letter case', () => {
    const html = '<p><span>[SKILLS Placeholder]</span></p>';
    assert.equal(locate(html, PLACEHOLDERS.skills), html.indexOf('['));
  });

  it('names a placeholder that formatting split into several runs', () => {
    assert.throws(
      () => locate('<p><span>[Skills </span><span class="b">placeholder]</span></p>', PLACEHOLDERS.skills),
      /\[skills placeholder\] is split by formatting/,
    );
  });

  it('says when a placeholder is missing altogether', () => {
    assert.throws(() => locate('<p>Nothing here</p>', PLACEHOLDERS.summary), /has no placeholder \[Summary placeholder\]/);
  });
});

describe('skillsLine', () => {
  const lineOf = (html) => skillsLine(html, locate(html, PLACEHOLDERS.skills), PLACEHOLDERS.skills);

  it('takes the whole paragraph the placeholder sits in', () => {
    const line = '<p class="x1"><span class="y2">[skills placeholder]</span></p>';
    assert.equal(lineOf(page(line)).line, line);
  });

  it('takes the whole list item the placeholder sits in', () => {
    const line = '<li class="c0 li-bullet-0"><span class="c3 c8">[Skills placeholder]</span></li>';
    assert.equal(lineOf(page(`<ul class="u">${line}</ul>`)).line, line);
  });

  it('accepts a paragraph without a span, non-breaking spaces and a paragraph inside a table cell', () => {
    assert.ok(lineOf(page('<p>[skills placeholder]</p>')));
    assert.ok(lineOf(page('<p><span>&nbsp;[skills placeholder]&nbsp;</span></p>')));
    assert.ok(lineOf(page('<table><tr><td><p><span>[skills placeholder]</span></p></td></tr></table>')));
  });

  for (const [name, markup] of [
    ['a bare table cell', '<table><tr><td><span>[skills placeholder]</span></td></tr></table>'],
    ['other text on the same line', '<p><span>Skills: [skills placeholder] and more</span></p>'],
    ['a nested list inside the list item', '<ul><li><span>[skills placeholder]</span><ul><li>x</li></ul></li></ul>'],
    ['no paragraph or list item at all', '<div>[skills placeholder]</div>'],
  ]) {
    it(`refuses ${name}`, () => {
      const html = name === 'no paragraph or list item at all' ? `<html><body>${markup}</body></html>` : page(markup);
      assert.throws(() => lineOf(html), /must sit alone on its own line/);
    });
  }
});

describe('renderSkills', () => {
  const line = '<li class="c0"><span class="c3">[skills placeholder]</span></li>';
  const lines = renderSkills(BLOCKS.skills, line, PLACEHOLDERS.skills).split('</li>').filter(Boolean);

  it('makes one copy of the line per skills line, keeping its own markup', () => {
    assert.equal(lines.length, BLOCKS.skills.length);
    for (const l of lines) assert.ok(l.startsWith('<li class="c0"><span class="c3"><span style="font-weight:700">'));
  });

  it('makes the category bold and the items regular', () => {
    assert.ok(lines[0].includes('<span style="font-weight:700">Frontend</span><span style="font-weight:400">: React, Next.js</span>'));
  });

  it('escapes &, < and > from the blocks', () => {
    assert.ok(lines[1].includes('Backend &amp; Data</span><span style="font-weight:400">: Node.js, &lt;PostgreSQL&gt;</span>'));
  });
});

describe('checkStructure', () => {
  const line = '<p class="x"><span class="y">[skills placeholder]</span></p>';
  const before = page(line);
  const good = before.replace(line, renderSkills(BLOCKS.skills, line, PLACEHOLDERS.skills));

  it('passes a correctly assembled result', () => {
    assert.doesNotThrow(() => checkStructure(before, line, good, BLOCKS.skills.length));
  });

  it('catches a lost closing tag', () => {
    const broken = good.replace('</span></p>', '</p>');
    assert.throws(() => checkStructure(before, line, broken, BLOCKS.skills.length), /nothing was written/);
  });

  it('catches an extra paragraph', () => {
    const extra = good.replace(TAIL, `<p>stray</p>${TAIL}`);
    assert.throws(() => checkStructure(before, line, extra, BLOCKS.skills.length), /<p> 7 instead of 6/);
  });
});

describe('fill', () => {
  const line = '<ul class="u"><li class="c0"><span class="c3">[Skills placeholder]</span></li></ul>';
  const base = page(line);
  const result = fill(base, BLOCKS);

  it('replaces title and summary in place, escaped', () => {
    assert.ok(result.includes('Jane Doe - Senior Frontend Engineer</span>'));
    assert.ok(result.includes('specializing in React &amp; TypeScript.</span>'));
  });

  it('leaves everything outside the skills line byte-for-byte as in the base', () => {
    const expected = withTitleAndSummary(base);
    const start = expected.indexOf('<li class="c0">');
    const end = expected.indexOf('</li>', start) + '</li>'.length;
    assert.ok(result.startsWith(expected.slice(0, start)));
    assert.ok(result.endsWith(expected.slice(end)));
  });

  it('leaves no placeholder behind', () => {
    assert.equal(/placeholder\]/i.test(result), false);
  });

  it('refuses to assemble when copying the line would leave tags unclosed', () => {
    const unclosed = page('<p class="x"><span class="y">[skills placeholder]</p>');
    assert.throws(() => fill(unclosed, BLOCKS), /nothing was written/);
  });

  it('works on a Google Docs export whatever its class names are', () => {
    const example = readFileSync(EXAMPLE_BASE, 'utf8');
    const renumbered = example.replace(/\bc(\d+)\b/g, (_, n) => `c${Number(n) + 40}`);
    for (const html of [example, renumbered]) {
      const out = fill(html, BLOCKS);
      const skillsParagraph = html.match(/<p class="([^"]*)"><span class="([^"]*)">\[skills placeholder\]/i);
      assert.ok(out.includes(`<p class="${skillsParagraph[1]}"><span class="${skillsParagraph[2]}"><span style="font-weight:700">Frontend</span>`));
    }
  });
});

describe('file name', () => {
  it('reads resumeFileName from resume-config.json without the .pdf, CV otherwise', () => {
    const dir = tempDir();
    try {
      const config = join(dir, 'resume-config.json');
      assert.equal(readCvName(config), 'CV');
      writeFileSync(config, JSON.stringify({ resumeFileName: 'Jane_Doe_CV.pdf' }));
      assert.equal(readCvName(config), 'Jane_Doe_CV');
      writeFileSync(config, JSON.stringify({ resumeFileName: null }));
      assert.equal(readCvName(config), 'CV');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the underscore that carries the vacancy id into the folder name', () => {
    assert.equal(slug('Acme_cmabc123def456ghi789jkl01'), 'Acme_cmabc123def456ghi789jkl01');
    assert.equal(slug('Senior Frontend Engineer (m/f/d)'), 'Senior-Frontend-Engineer-mfd');
  });

  it('puts the vacancy into the folder and honours --out', () => {
    const path = outputPath({ title: 'Senior Frontend Engineer' }, new Map([['company', 'Acme_cm1']]));
    assert.match(path, /\/out\/Acme_cm1-Senior-Frontend-Engineer\/[^/]+\.html$/);
    assert.equal(outputPath({ title: 't' }, new Map([['out', '-']])), '-');
  });
});

describe('command line', () => {
  const run = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

  const withFiles = (baseHtml, blocksMd, fn) => {
    const dir = tempDir();
    try {
      writeFileSync(join(dir, 'base.html'), baseHtml);
      writeFileSync(join(dir, 'blocks.md'), blocksMd);
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('writes the resume to --out', () => {
    withFiles(page('<p><span>[skills placeholder]</span></p>'), BLOCKS_MD, (dir) => {
      const r = run(['blocks.md', '--base=base.html', '--out=cv.html'], dir);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(readFileSync(join(dir, 'cv.html'), 'utf8').includes('<span style="font-weight:700">Frontend</span>'));
    });
  });

  it('writes nothing when the base is not usable', () => {
    withFiles(page('<p><span>[Skills </span><span>placeholder]</span></p>'), BLOCKS_MD, (dir) => {
      const r = run(['blocks.md', '--base=base.html', '--out=cv.html'], dir);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /split by formatting/);
      assert.equal(existsSync(join(dir, 'cv.html')), false);
    });
  });

  it('writes nothing when the blocks are incomplete', () => {
    withFiles(page('<p><span>[skills placeholder]</span></p>'), '**Title:** Engineer\n', (dir) => {
      const r = run(['blocks.md', '--base=base.html', '--out=cv.html'], dir);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /no Summary section/);
      assert.equal(existsSync(join(dir, 'cv.html')), false);
    });
  });

  it('does not overwrite an existing file without --force', () => {
    withFiles(page('<p><span>[skills placeholder]</span></p>'), BLOCKS_MD, (dir) => {
      writeFileSync(join(dir, 'cv.html'), 'keep me');
      const r = run(['blocks.md', '--base=base.html', '--out=cv.html'], dir);
      assert.equal(r.status, 1);
      assert.equal(readFileSync(join(dir, 'cv.html'), 'utf8'), 'keep me');
      assert.equal(run(['blocks.md', '--base=base.html', '--out=cv.html', '--force'], dir).status, 0);
    });
  });
});
