#!/usr/bin/env node
// Look-up and hygiene check for stories.json — the user's own STAR stories and
// "about me" texts that narrative form fields are grounded in.
//
// profile.json's qa[] answers short factual questions. It cannot answer
// "describe the hardest problem you solved" — that needs a real event from the
// user's career, and the rule of this skill is that Claude never invents one.
// This script finds candidates; deciding whether a story really answers the
// question, and compressing it to the length the form wants, stays with Claude.
//
// There is no importer: stories.json is built and edited by an agent working
// from whatever material the user hands over (see the import-stories skill).
// `validate` is the guard that keeps that hand-edited file clean.
//
// Usage:
//   stories.mjs find "<question or topic>" [--limit=N] [--full]
//   stories.mjs show <story-id|about-id>
//   stories.mjs list
//   stories.mjs themes              the tag vocabulary, with what each means
//   stories.mjs coverage            which themes have a story and which have none
//   stories.mjs validate            exit 1 on any error

import { readFileSync, existsSync } from "node:fs";
import { THEMES, THEME_IDS, themesFor, looksLikeAbout, mentions } from "./lib/story-themes.mjs";
import { optionalDataPath } from "./lib/data-dir.mjs";

const SCHEMA_VERSION = 2;
const STAR = ["situation", "task", "action", "result"];
const LANGS = ["en", "pl"];
const STAR_MAX = 1200; // longer usually means two stories or a neighbouring section got merged in
const SHORT_MAX = 400;

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const has = (name) => argv.includes(`--${name}`);

if (cmd === "themes") {
  for (const id of THEME_IDS) console.log(`${id.padEnd(20)} ${THEMES[id].about}`);
  process.exit(0);
}

const STORIES_PATH = optionalDataPath("stories.json");
if (!STORIES_PATH || !existsSync(STORIES_PATH)) {
  console.error(
    `No stories.json at ${STORIES_PATH ?? "(no data repo found)"}.\n` +
      "Run the import-stories skill: hand the agent your interview prep, CV, notes — anything.",
  );
  process.exit(1);
}
let db;
try {
  db = JSON.parse(readFileSync(STORIES_PATH, "utf8"));
} catch (e) {
  console.error(`stories.json is not valid JSON: ${e.message}`);
  process.exit(1);
}
const stories = Array.isArray(db.stories) ? db.stories : [];
const about = Array.isArray(db.about) ? db.about : [];

const oneLine = (s, n = 160) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);

// ---------------------------------------------------------------- validate

function validate() {
  const errors = [];
  const warnings = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

  if (db.$schemaVersion !== SCHEMA_VERSION) {
    err("file", `$schemaVersion must be ${SCHEMA_VERSION} (got ${JSON.stringify(db.$schemaVersion)})`);
  }
  if (db.answers || stories.some((s) => s.variants || s.sources || s.bestFor || s.principles)) {
    err("file", "leftovers of schema 1 (answers / variants / sources / bestFor / principles) — drop them");
  }

  const seen = new Set();
  const checkId = (where, id) => {
    if (typeof id !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) err(where, `id must be kebab-case, got ${JSON.stringify(id)}`);
    else if (seen.has(id)) err(where, `duplicate id "${id}"`);
    seen.add(id);
  };
  // Things that must never sit inside a story: they belong elsewhere or to someone else.
  const leaks = (where, text, lang) => {
    if (/\bWhy [A-Z][\w&.-]*( [A-Z][\w&.-]*)?\s*:/.test(text)) err(where, 'contains a "Why <Company>:" section — company-specific, does not belong here');
    if (/salary|wynagrodzen|\b\d[\d ,.]*\s*(PLN|zł|EUR|USD)\b/i.test(text)) err(where, "mentions salary or money — compensation lives in profile.json only");
    if (lang === "en" && /[а-яіїєґА-ЯІЇЄҐ]/.test(text)) err(where, "Cyrillic text in an English entry");
    if (/(^|\n)\s*(Polski|Українською|Русский|Ukrainian|Russian)\s*:/i.test(text)) err(where, "contains a translation block — one language per entry");
  };

  stories.forEach((s, i) => {
    const where = `stories[${i}] ${s.id ?? "(no id)"}`;
    checkId(where, s.id);
    if (!s.title || typeof s.title !== "string") err(where, "title missing");
    if (!Array.isArray(s.themes) || !s.themes.length) err(where, "themes missing — tag it from `stories.mjs themes`");
    else for (const t of s.themes) if (!THEMES[t]) err(where, `unknown theme "${t}" (see \`stories.mjs themes\`)`);
    if (!Array.isArray(s.stack)) err(where, "stack must be an array (may be empty)");
    if (!LANGS.includes(s.lang)) err(where, `lang must be one of ${LANGS.join("/")}`);
    for (const k of STAR) {
      if (typeof s[k] !== "string" || !s[k].trim()) err(where, `${k} missing — a story without ${k} is not a story; ask the user`);
      else if (s[k].length > STAR_MAX) warn(where, `${k} is ${s[k].length} chars — two stories or a neighbouring section merged in?`);
    }
    if (s.short !== undefined) {
      if (typeof s.short !== "string" || !s.short.trim()) err(where, "short must be a non-empty string when present");
      else if (s.short.length > SHORT_MAX) warn(where, `short is ${s.short.length} chars, aim for 1-2 sentences`);
      if (typeof s.shortReviewed !== "boolean") err(where, "shortReviewed (true/false) required when short is present");
    } else if (s.shortReviewed !== undefined) err(where, "shortReviewed without short");
    leaks(where, STAR.map((k) => s[k] || "").join("\n") + "\n" + (s.short || ""), s.lang);
  });

  about.forEach((a, i) => {
    const where = `about[${i}] ${a.id ?? "(no id)"}`;
    checkId(where, a.id);
    if (!a.title) err(where, "title missing");
    if (typeof a.text !== "string" || !a.text.trim()) err(where, "text missing");
    if (!LANGS.includes(a.lang)) err(where, `lang must be one of ${LANGS.join("/")}`);
    leaks(where, a.text || "", a.lang);
  });

  for (const w of warnings) console.log(`warn  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  console.log(`\n${stories.length} stories, ${about.length} about entries — ${errors.length} error(s), ${warnings.length} warning(s).`);
  return errors.length === 0;
}

// ---------------------------------------------------------------- printing

function printStory(s, { full, matched = [] } = {}) {
  const themes = (s.themes || []).map((t) => (matched.includes(t) ? `*${t}` : t)).join(", ");
  console.log(`\n[${s.id}]  ${s.title}  (${s.lang})`);
  console.log(`  themes: ${themes}${s.stack?.length ? `   stack: ${s.stack.join(", ")}` : ""}`);
  if (s.short) console.log(`  short${s.shortReviewed ? "" : " (DRAFT — user has not approved it)"}: ${s.short}`);
  if (full) for (const k of STAR) console.log(`  ${k.toUpperCase()}: ${s[k].replace(/\n/g, "\n    ")}`);
}

function printAbout(a, full) {
  console.log(`\n[${a.id}]  ${a.title}  (${a.lang})`);
  console.log(`  ${full ? a.text.replace(/\n/g, "\n  ") : oneLine(a.text, 220)}`);
}

// ---------------------------------------------------------------- commands

if (cmd === "validate") {
  process.exit(validate() ? 0 : 1);
} else if (cmd === "find") {
  const query = argv[1];
  if (!query) {
    console.error('Usage: stories.mjs find "<question or topic>"');
    process.exit(1);
  }
  const limit = Number(flag("limit", 4));
  const hits = themesFor(query);
  const matched = Object.keys(hits);

  // A story scores on shared themes (a theme the question hits twice counts
  // double, capped) and on any of its stack words the question names.
  const scored = stories
    .map((s) => {
      const shared = (s.themes || []).filter((t) => hits[t]);
      const stackHits = (s.stack || []).filter((w) => mentions(query, w));
      const score = shared.reduce((n, t) => n + Math.min(hits[t], 2), 0) + 1.5 * stackHits.length;
      return { s, score, shared };
    })
    .sort((a, b) => b.score - a.score);

  console.log(`Question: "${query}"`);
  console.log(`Themes it touches: ${matched.length ? matched.join(", ") : "(none recognised)"}`);
  const good = scored.filter((r) => r.score > 0).slice(0, limit);
  if (good.length) {
    console.log("Candidates (* = theme shared with the question). Read the STAR and judge; a clean fit is not a score.");
    for (const r of good) printStory(r.s, { full: has("full"), matched: r.shared });
  } else {
    console.log(
      "\nNo story shares a theme with this question. Do NOT stretch one to fit — if the question\n" +
        "is about something the user did, ask them. Everything on file, to judge for yourself:",
    );
    for (const r of scored) printStory(r.s, { matched: [] });
  }
  if (about.length) {
    console.log(
      looksLikeAbout(query)
        ? "\nThis reads like a 'tell us about yourself' question — start from these about-me texts, not a story:"
        : "\nAbout-me texts (for 'tell us about yourself' style questions):",
    );
    for (const a of about) console.log(`  [${a.id}] ${a.title}`);
  }
} else if (cmd === "show") {
  const id = argv[1];
  const s = stories.find((x) => x.id === id);
  const a = about.find((x) => x.id === id);
  if (s) printStory(s, { full: true });
  else if (a) printAbout(a, true);
  else {
    console.error(`No entry with id "${id}".`);
    process.exit(1);
  }
} else if (cmd === "list") {
  console.log(`${stories.length} stories:`);
  for (const s of stories) console.log(`  [${s.id}] ${s.title}\n      ${(s.themes || []).join(", ")}`);
  console.log(`\n${about.length} about entries:`);
  for (const a of about) console.log(`  [${a.id}] ${a.title}`);
} else if (cmd === "coverage") {
  const by = Object.fromEntries(THEME_IDS.map((t) => [t, []]));
  for (const s of stories) for (const t of s.themes || []) if (by[t]) by[t].push(s.id);
  const empty = THEME_IDS.filter((t) => !by[t].length);
  for (const t of THEME_IDS) if (by[t].length) console.log(`${t.padEnd(20)} ${by[t].length}  ${by[t].join(", ")}`);
  console.log(`\nNo story for: ${empty.length ? empty.join(", ") : "(all covered)"}`);
} else {
  console.error('Usage: stories.mjs <find "<text>" | show <id> | list | themes | coverage | validate> [--limit=N] [--full]');
  process.exit(1);
}
