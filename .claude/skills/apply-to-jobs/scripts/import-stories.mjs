#!/usr/bin/env node
// One-way import of a directory of interview-prep .docx files into stories.json.
//
// Point it at any folder of prep documents — typically one subfolder per
// company the user has interviewed with. Two kinds of content are worth
// keeping:
//
//   * STAR stories — a numbered title, an optional `Best for:` tag line, and
//     Situation/Task/Action/Result sections. These are the raw material for
//     "describe a time when…" and "what is the hardest problem you solved"
//     form questions.
//   * Plain Q&A — a question line followed by prose, the same shape as
//     profile.json's qa[] but far too long to live there.
//
// Both are *verified facts about the user*, written by the user. That is the
// whole point: an application-form narrative can be grounded in one of these
// instead of being invented. Nothing here is generated.
//
// Prep archives overlap heavily (the same story retold for a different loop,
// often as a literal "Copy of …" duplicate), so identical answers collapse
// into one entry that remembers every source document.
//
// Usage:
//   import-stories.mjs <dir-with-docx> [--out=<path>] [--dry]

import { writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tokenize, jaccard } from "./lib/qa-match.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
const DEFAULT_OUT = join(REPO_ROOT, "stories.json");

const args = process.argv.slice(2);
const srcDir = args.find((a) => !a.startsWith("--"));
const outPath = (args.find((a) => a.startsWith("--out=")) || "").slice(6) || DEFAULT_OUT;
const dry = args.includes("--dry");

if (!srcDir) {
  console.error("Usage: import-stories.mjs <dir-with-docx> [--out=<path>] [--dry]");
  process.exit(1);
}

// ---------------------------------------------------------------- docx text

// A .docx is a zip; word/document.xml holds the body. Paragraph ends are the
// only structure we need, so </w:p> becomes a newline and every other tag is
// dropped. `unzip -p` avoids pulling in a zip library for a one-way import.
function docxText(path) {
  const xml = execFileSync("unzip", ["-p", path, "word/document.xml"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.toLowerCase().endsWith(".docx") && !basename(p).startsWith("~$")) acc.push(p);
  }
  return acc;
}

// ---------------------------------------------------------------- parsing

const SECTION_RE = /^(Situation|Task|Action|Result)\s*:?\s*(.*)$/i;
const NUMBERED_RE = /^(\d{1,2})[.)]\s+(.{3,120})$/;
const BEST_FOR_RE = /^Best for\s*:\s*(.+)$/i;
const STORY_TITLE_RE = /^Story\s*:\s*(.+)$/i;
// A question is a line that ends in "?" or a short label line ending in ":".
const QUESTION_RE = /^(.{6,200}\?)\s*$|^([A-Z][^.!?]{5,120}):\s*$/;

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Company + document name come from the archive's own folder layout: the
// containing folder names the company, the filename names the document.
function provenance(path, root) {
  const rel = relative(root, path);
  const parts = rel.split("/").filter(Boolean);
  const doc = basename(parts.pop(), ".docx").trim();
  // Strip the archive's own top folder ("Recruting") if it wraps everything.
  const dirs = parts.filter((p) => !/^recrut/i.test(p) || parts.length === 1);
  const company = (dirs.pop() || "unknown").replace(/\s*recruiting\s*/i, "").trim() || "unknown";
  return { company, doc };
}

function parseDoc(text, prov) {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const stories = [];
  const answers = [];

  let story = null; // open STAR story
  let qa = null; // open question/answer

  const closeStory = () => {
    if (story && (story.situation || story.action)) stories.push(story);
    story = null;
  };
  const closeQa = () => {
    if (qa && qa.answerLines.length) {
      const answer = qa.answerLines.join("\n").trim();
      if (answer.length > 40) answers.push({ question: qa.question, answer });
    }
    qa = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const numbered = NUMBERED_RE.exec(line);
    if (numbered) {
      // A numbered heading starts a new story only when a STAR section or a
      // "Story:" line follows within the next few lines — otherwise it is an
      // ordinary numbered list item inside an answer.
      const lookahead = lines.slice(i + 1, i + 6).map((l) => l.trim());
      const isStory = lookahead.some(
        (l) => SECTION_RE.test(l) || STORY_TITLE_RE.test(l) || BEST_FOR_RE.test(l),
      );
      if (isStory) {
        closeStory();
        closeQa();
        story = {
          title: numbered[2].trim(),
          bestFor: [],
          situation: "",
          task: "",
          action: "",
          result: "",
          ...prov,
        };
        continue;
      }
    }

    if (story) {
      const bf = BEST_FOR_RE.exec(line);
      if (bf) {
        story.bestFor = bf[1]
          .split(/[,;]/)
          .map((t) => t.trim().replace(/\.$/, ""))
          .filter(Boolean);
        continue;
      }
      const st = STORY_TITLE_RE.exec(line);
      if (st) {
        // Amazon docs name the leadership principle in the numbered heading
        // and the actual story on the next line. Keep both.
        story.principle = story.title;
        story.title = st[1].trim();
        continue;
      }
      const sec = SECTION_RE.exec(line);
      if (sec) {
        story.section = sec[1].toLowerCase();
        if (sec[2]) story[story.section] = sec[2].trim();
        continue;
      }
      if (story.section) {
        story[story.section] = (story[story.section] ? story[story.section] + "\n" : "") + line;
        continue;
      }
      // Text before any section header and after the title: treat the story as
      // finished and fall through to normal Q&A handling.
      closeStory();
    }

    const q = QUESTION_RE.exec(line);
    if (q) {
      closeQa();
      qa = { question: (q[1] || q[2]).trim().replace(/:$/, ""), answerLines: [] };
      continue;
    }
    if (qa) qa.answerLines.push(line);
  }
  closeStory();
  closeQa();
  return { stories, answers };
}

// ---------------------------------------------------------------- run

const root = resolve(srcDir);
const files = walk(root);
if (!files.length) {
  console.error(`No .docx found under ${root}`);
  process.exit(1);
}

const storyByKey = new Map();
const answerByKey = new Map();

for (const file of files) {
  const prov = provenance(file, root);
  const { stories, answers } = parseDoc(docxText(file), prov);

  for (const s of stories) {
    const key = norm(s.situation + s.action).slice(0, 300);
    const existing = storyByKey.get(key);
    if (existing) {
      existing.sources.push(`${prov.company}/${prov.doc}`);
      // Keep the richest tag set across duplicates.
      if (s.bestFor.length > existing.bestFor.length) existing.bestFor = s.bestFor;
      if (s.principle && !existing.principles.includes(s.principle)) {
        existing.principles.push(s.principle);
      }
      continue;
    }
    storyByKey.set(key, {
      id: slug(s.title),
      title: s.title,
      bestFor: s.bestFor,
      principles: s.principle ? [s.principle] : [],
      situation: s.situation.trim(),
      task: s.task.trim(),
      action: s.action.trim(),
      result: s.result.trim(),
      sources: [`${prov.company}/${prov.doc}`],
    });
  }

  for (const a of answers) {
    const key = norm(a.answer).slice(0, 300);
    const existing = answerByKey.get(key);
    if (existing) {
      if (!existing.sources.includes(`${prov.company}/${prov.doc}`)) {
        existing.sources.push(`${prov.company}/${prov.doc}`);
      }
      if (!existing.questions.some((q) => norm(q) === norm(a.question))) {
        existing.questions.push(a.question);
      }
      continue;
    }
    answerByKey.set(key, {
      id: slug(a.question),
      questions: [a.question],
      answer: a.answer,
      sources: [`${prov.company}/${prov.doc}`],
    });
  }
}

// The same event gets retold at different lengths across interview loops — one
// company wants a tight two-minute answer, another a deep dive. Exact-text
// dedup cannot see that those are one story, so cluster on how much of the
// Situation+Action vocabulary two entries share. The longest retelling wins and
// the shorter ones ride along as `variants`, because a short form field often
// wants the short version.
//
// 0.22 is a starting point, not a constant of nature: it was measured on one
// archive, where every pair at 0.23 or above turned out to be one event retold
// and the next pair down sat at 0.18 — a wide, unambiguous gap. Different
// writing produces a different gap. Run with --dry, read the clusters, and
// move the threshold if stories are being merged that should not be (or the
// reverse).
const SAME_STORY = 0.22;

function clusterStories(list) {
  const withTokens = list.map((s) => ({
    story: s,
    tokens: tokenize(`${s.title} ${s.situation} ${s.action}`),
    len: (s.situation + s.action + s.result).length,
  }));
  withTokens.sort((a, b) => b.len - a.len); // longest first — it becomes primary
  const clusters = [];
  for (const item of withTokens) {
    const hit = clusters.find((c) => jaccard(c.tokens, item.tokens) >= SAME_STORY);
    if (hit) {
      hit.story.variants.push({
        title: item.story.title,
        principles: item.story.principles,
        bestFor: item.story.bestFor,
        situation: item.story.situation,
        task: item.story.task,
        action: item.story.action,
        result: item.story.result,
        sources: item.story.sources,
      });
      for (const p of item.story.principles) {
        if (!hit.story.principles.includes(p)) hit.story.principles.push(p);
      }
      for (const t of item.story.bestFor) {
        if (!hit.story.bestFor.includes(t)) hit.story.bestFor.push(t);
      }
      for (const src of item.story.sources) {
        if (!hit.story.sources.includes(src)) hit.story.sources.push(src);
      }
      continue;
    }
    item.story.variants = [];
    clusters.push(item);
  }
  return clusters.map((c) => c.story);
}

// Stable ids: a duplicate slug gets a numeric suffix rather than silently
// overwriting the entry it collides with.
const seen = new Set();
const uniqueId = (e) => {
  let id = e.id || "entry";
  let n = 2;
  while (seen.has(id)) id = `${e.id}-${n++}`;
  seen.add(id);
  e.id = id;
};
const stories = clusterStories([...storyByKey.values()]);
const answers = [...answerByKey.values()];
stories.forEach(uniqueId);
answers.forEach(uniqueId);

const out = {
  $schemaVersion: 1,
  note:
    "Interview-prep material written by the user, imported from a .docx archive. " +
    "Every entry is a verified fact about the user's own work — narrative form fields may be " +
    "grounded in these instead of being invented. Regenerate with import-stories.mjs.",
  importedFrom: basename(root),
  stories,
  answers,
};

if (dry) {
  console.log(`stories: ${stories.length}, answers: ${answers.length}`);
  for (const s of stories) console.log(`  [${s.id}] ${s.title}  (+${s.variants.length} variants)  <- ${s.sources.join(", ")}`);
  process.exit(0);
}

writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(`Wrote ${outPath}: ${stories.length} stories, ${answers.length} answers`);
