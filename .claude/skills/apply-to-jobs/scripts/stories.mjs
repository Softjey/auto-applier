#!/usr/bin/env node
// Deterministic search over stories.json — the user's own interview-prep
// material (STAR stories and long-form answers) imported by import-stories.mjs.
//
// Why this exists: profile.json's qa[] answers short factual questions. It
// cannot answer "describe the hardest problem you solved and how you mitigated
// the risk" — that needs a real event from the user's career, and the whole
// rule of this skill is that Claude never invents one. This script finds the
// candidates; deciding whether a story actually answers the question, and
// compressing it to the length the form wants, stays with Claude.
//
// Ranking reuses lib/qa-match.mjs so a phrase never scores differently here
// than it does in profile-qa.mjs or resolve-fields.mjs.
//
// Usage:
//   stories.mjs find "<question or topic>" [--limit=N] [--full]
//   stories.mjs show <story-id|answer-id>
//   stories.mjs list [--tags]

import { readFileSync, existsSync } from "node:fs";
import { tokenize, jaccard, verdictFor } from "./lib/qa-match.mjs";
import { optionalDataPath } from "./lib/data-dir.mjs";

const STORIES_PATH = optionalDataPath("stories.json");

if (!STORIES_PATH || !existsSync(STORIES_PATH)) {
  console.error(`No stories.json at ${STORIES_PATH ?? "(no data repo found)"} — run import-stories.mjs first.`);
  process.exit(1);
}
const db = JSON.parse(readFileSync(STORIES_PATH, "utf8"));

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const has = (name) => argv.includes(`--${name}`);

// A story is searchable by everything that describes it: its title, the
// "Best for" tags the user wrote, any Amazon leadership principle it was filed
// under, and the prose itself. Weighting title+tags above the body keeps a
// story about caching from winning a question about mentoring just because the
// word "team" appears in its Result.
function storyHaystacks(s) {
  const label = [s.title, ...(s.bestFor || []), ...(s.principles || [])].join(" ");
  const body = [s.situation, s.task, s.action, s.result].join(" ");
  return { label: tokenize(label), body: tokenize(body) };
}

function scoreStory(qTokens, s) {
  const { label, body } = storyHaystacks(s);
  return Math.max(jaccard(qTokens, label), 0.6 * jaccard(qTokens, body));
}

function scoreAnswer(qTokens, a) {
  const qs = Math.max(...a.questions.map((q) => jaccard(qTokens, tokenize(q))));
  return Math.max(qs, 0.5 * jaccard(qTokens, tokenize(a.answer)));
}

const oneLine = (s, n = 150) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

function printStory(s, full) {
  console.log(`\n[${s.id}]  ${s.title}`);
  if (s.bestFor?.length) console.log(`  best for: ${s.bestFor.join(", ")}`);
  if (s.principles?.length) console.log(`  principles: ${s.principles.join(", ")}`);
  console.log(`  sources: ${s.sources.join(", ")}`);
  if (s.variants?.length) console.log(`  variants: ${s.variants.length} shorter retelling(s)`);
  for (const k of ["situation", "task", "action", "result"]) {
    if (!s[k]) continue;
    console.log(`  ${k.toUpperCase()}: ${full ? s[k].replace(/\n/g, "\n    ") : oneLine(s[k], 200)}`);
  }
}

function printAnswer(a, full) {
  console.log(`\n[${a.id}]  ${a.questions[0]}`);
  if (a.questions.length > 1) console.log(`  also asked as: ${a.questions.slice(1).join(" | ")}`);
  console.log(`  sources: ${a.sources.join(", ")}`);
  console.log(`  ${full ? a.answer.replace(/\n/g, "\n  ") : oneLine(a.answer, 300)}`);
}

if (cmd === "find") {
  const query = argv[1];
  if (!query) {
    console.error('Usage: stories.mjs find "<question or topic>"');
    process.exit(1);
  }
  const limit = Number(flag("limit", 5));
  const q = tokenize(query);

  // Stories and answers are ranked in SEPARATE pools on purpose. A behavioural
  // question ("the most complex problem you solved") shares almost no
  // vocabulary with the story that answers it — "class merge logic" is not
  // lexically close to "complex frontend problem" — so a story will always
  // lose a global sort to some chatty Q&A that happens to reuse the question's
  // own words. Pooling them separately keeps the real candidates visible, and
  // the scores stay honest about how weak the lexical evidence is.
  const stories = db.stories
    .map((s) => ({ entry: s, score: scoreStory(q, s) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const answers = db.answers
    .map((a) => ({ entry: a, score: scoreAnswer(q, a) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  console.log(`Candidates for: "${query}"`);
  console.log(
    "Lexical overlap only. A low score does NOT mean a story is irrelevant —\n" +
      "read the titles and tags and decide. If none of them actually fits, ask\n" +
      "the user; never assemble an answer out of pieces that do not fit.\n",
  );
  console.log("=== STAR stories ===");
  for (const r of stories) {
    console.log(`--- ${r.score.toFixed(2)} (${verdictFor(r.score)})`);
    printStory(r.entry, has("full"));
  }
  if (answers.length) {
    console.log("\n=== long-form answers ===");
    for (const r of answers) {
      console.log(`--- ${r.score.toFixed(2)} (${verdictFor(r.score)})`);
      printAnswer(r.entry, has("full"));
    }
  }
} else if (cmd === "show") {
  const id = argv[1];
  const s = db.stories.find((x) => x.id === id);
  const a = db.answers.find((x) => x.id === id);
  if (s) printStory(s, true);
  else if (a) printAnswer(a, true);
  else {
    console.error(`No entry with id "${id}".`);
    process.exit(1);
  }
  if (s?.variants?.length) {
    for (const v of s.variants) {
      console.log(`\n  --- shorter retelling: ${v.title}  (${v.sources.join(", ")})`);
      for (const k of ["situation", "task", "action", "result"]) {
        if (v[k]) console.log(`    ${k.toUpperCase()}: ${v[k].replace(/\n/g, "\n      ")}`);
      }
    }
  }
} else if (cmd === "list") {
  console.log(`${db.stories.length} stories:`);
  for (const s of db.stories) {
    console.log(`  [${s.id}] ${s.title}`);
    if (has("tags") && s.bestFor?.length) console.log(`      ${s.bestFor.join(", ")}`);
  }
  console.log(`\n${db.answers.length} long-form answers:`);
  for (const a of db.answers) console.log(`  [${a.id}] ${oneLine(a.questions[0], 90)}`);
} else {
  console.error('Usage: stories.mjs <find "<text>" | show <id> | list> [--limit=N] [--full] [--tags]');
  process.exit(1);
}
