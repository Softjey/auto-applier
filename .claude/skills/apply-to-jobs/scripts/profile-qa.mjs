#!/usr/bin/env node
// Deterministic fuzzy-match + atomic-write index over profile.json's qa[].
// Semantic judgment ("is this really the same question?") stays with Claude —
// this script only ranks candidates and owns writes so qa[] never gets
// hand-edited into a corrupted state mid-run.
//
// Usage:
//   profile-qa.mjs find "<question text>" [--limit=5] [--json]
//   profile-qa.mjs add --question="..." --answer="..." --canonical=topic
//                       --kind=fact|policy|narrative|employer-specific
//                       [--tags=a,b] [--aliases="v1|v2"] [--force]
//   profile-qa.mjs alias <id> --add="new phrasing seen on this ATS"
//   profile-qa.mjs touch <id>
//   profile-qa.mjs list [--tag=x] [--grep=text]

import {
  tokenize,
  bestMatchScore,
  verdictFor,
  loadProfile,
  saveProfile,
} from "./lib/qa-match.mjs";

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq === -1) flags[arg.slice(2)] = true;
      else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function generateId(canonical) {
  const base = (canonical || "qa")
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
  const suffix = Date.now().toString(36).slice(-6);
  return `${base || "qa"}-${suffix}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function cmdFind(positional, flags) {
  const query = positional[0];
  if (!query) {
    console.error('Usage: profile-qa.mjs find "<question text>" [--limit=5] [--json]');
    process.exit(1);
  }
  const limit = flags.limit ? parseInt(flags.limit, 10) : 5;
  const profile = loadProfile();
  const queryTokens = tokenize(query);
  const scored = profile.qa
    .map((entry) => {
      const score = bestMatchScore(queryTokens, entry);
      return {
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
        tags: entry.tags || [],
        canonicalTopic: entry.canonicalTopic || null,
        score: Number(score.toFixed(3)),
        verdict: verdictFor(score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (flags.json) {
    console.log(JSON.stringify(scored, null, 2));
    return;
  }
  if (scored.length === 0) {
    console.log("No candidates (qa[] is empty).");
    return;
  }
  for (const c of scored) {
    console.log(`[${c.verdict}] (${c.score}) ${c.id}: "${c.question}" -> "${c.answer}"`);
  }
}

function cmdAdd(flags) {
  const { question, answer, canonical, kind, tags, aliases, force } = flags;
  const KINDS = ["fact", "policy", "narrative", "employer-specific"];
  if (!question || !answer || !canonical || !KINDS.includes(kind)) {
    console.error(
      `Usage: profile-qa.mjs add --question="..." --answer="..." --canonical=topic --kind=${KINDS.join("|")} [--tags=a,b] [--aliases="v1|v2"] [--force]`,
    );
    console.error(
      "  fact: a true statement about the user. policy: a standing rule for how to answer (consents, self-assessments, opt-outs).",
    );
    console.error("  narrative: prose. employer-specific: only for one company.");
    process.exit(1);
  }
  const profile = loadProfile();
  const sameTopic = profile.qa.find((e) => e.canonicalTopic === canonical);
  if (sameTopic && !force) {
    console.error(`Refusing to add: canonical topic "${canonical}" already exists as ${sameTopic.id}.`);
    console.error(`Consider instead: node profile-qa.mjs alias ${sameTopic.id} --add="${question}"`);
    process.exit(1);
  }
  const queryTokens = tokenize(question);
  const ranked = profile.qa
    .map((entry) => ({ entry, score: bestMatchScore(queryTokens, entry) }))
    .sort((a, b) => b.score - a.score);
  const nearDuplicate = ranked[0];

  if (!force && nearDuplicate && nearDuplicate.score > 0.85) {
    console.error(`Refusing to add: near-duplicate found (score ${nearDuplicate.score.toFixed(3)}):`);
    console.error(`  ${nearDuplicate.entry.id}: "${nearDuplicate.entry.question}" -> "${nearDuplicate.entry.answer}"`);
    console.error(`Consider instead: node profile-qa.mjs alias ${nearDuplicate.entry.id} --add="${question}"`);
    console.error("Or pass --force to add as a separate entry anyway.");
    process.exit(1);
  }

  const entry = {
    id: generateId(canonical),
    canonicalTopic: canonical,
    kind,
    question,
    aliases: aliases ? aliases.split("|").map((s) => s.trim()).filter(Boolean) : [],
    answer,
    tags: tags ? tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
    source: "user-provided",
    createdAt: today(),
    lastUsed: today(),
    timesUsed: 0,
  };
  profile.qa.push(entry);
  saveProfile(profile);
  console.log(`Added ${entry.id}: "${entry.question}" -> "${entry.answer}"`);
}

function cmdAlias(positional, flags) {
  const id = positional[0];
  if (!id || !flags.add) {
    console.error('Usage: profile-qa.mjs alias <id> --add="new phrasing"');
    process.exit(1);
  }
  const profile = loadProfile();
  const entry = profile.qa.find((e) => e.id === id);
  if (!entry) {
    console.error(`No qa entry with id "${id}"`);
    process.exit(1);
  }
  entry.aliases = entry.aliases || [];
  if (!entry.aliases.includes(flags.add)) entry.aliases.push(flags.add);
  saveProfile(profile);
  console.log(`Added alias to ${id}: "${flags.add}"`);
}

function cmdTouch(positional) {
  const id = positional[0];
  if (!id) {
    console.error("Usage: profile-qa.mjs touch <id>");
    process.exit(1);
  }
  const profile = loadProfile();
  const entry = profile.qa.find((e) => e.id === id);
  if (!entry) {
    console.error(`No qa entry with id "${id}"`);
    process.exit(1);
  }
  entry.timesUsed = (entry.timesUsed || 0) + 1;
  entry.lastUsed = today();
  saveProfile(profile);
  console.log(`Touched ${id}: timesUsed=${entry.timesUsed}, lastUsed=${entry.lastUsed}`);
}

function cmdList(flags) {
  const profile = loadProfile();
  let entries = profile.qa;
  if (flags.tag) {
    entries = entries.filter((e) => (e.tags || []).includes(flags.tag));
  }
  if (flags.grep) {
    const needle = flags.grep.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.question.toLowerCase().includes(needle) ||
        (e.aliases || []).some((a) => a.toLowerCase().includes(needle)) ||
        e.answer.toLowerCase().includes(needle),
    );
  }
  if (entries.length === 0) {
    console.log("No matching qa entries.");
    return;
  }
  for (const e of entries) {
    console.log(`${e.id} [${(e.tags || []).join(",")}] used:${e.timesUsed || 0}`);
    console.log(`  Q: ${e.question}`);
    if ((e.aliases || []).length) console.log(`  aliases: ${e.aliases.join(" | ")}`);
    console.log(`  A: ${e.answer}`);
  }
}

const [, , cmd, ...rest] = process.argv;
const { positional, flags } = parseArgs(rest);

switch (cmd) {
  case "find":
    cmdFind(positional, flags);
    break;
  case "add":
    cmdAdd(flags);
    break;
  case "alias":
    cmdAlias(positional, flags);
    break;
  case "touch":
    cmdTouch(positional);
    break;
  case "list":
    cmdList(flags);
    break;
  default:
    console.error("Usage: profile-qa.mjs <find|add|alias|touch|list> ...");
    process.exit(1);
}
