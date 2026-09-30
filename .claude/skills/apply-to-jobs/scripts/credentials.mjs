#!/usr/bin/env node
// credentials.mjs — the store of employer-portal logins, keyed by registrable domain.
//
// Some ATSes will not take an application without a candidate account (Workday,
// Avature/Deloitte, and others). This agent does not create accounts or type
// passwords into an employer's form — that is a hard limit and an explicit
// instruction does not lift it. What it does instead: generate a strong password,
// record it here against the domain, and hand the user the one line they need. The
// user does the sign-up; the agent then drives every remaining step.
//
// Usage
//   node credentials.mjs add --domain=<host> --company="<Name>" [--login=<email>]
//                            [--url=<signup url>] [--note="..."] [--length=20]
//   node credentials.mjs get --domain=<host>
//   node credentials.mjs list [--secrets]        # secrets are masked unless asked for
//   node credentials.mjs handoff --domain=<h> [--domain=<h> ...]   # the "Company: login - password" block
//
// The store is credentials.json in the data repo. It holds real credentials for
// real accounts: same no-public-remote rule as profile.json and stories.json.

import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dataPath } from "./lib/data-dir.mjs";
import { profilePath } from "./lib/qa-match.mjs";

const store = () => dataPath("credentials.json");

// The login for a new portal account defaults to the profile's own e-mail.
function defaultLogin() {
  try {
    return JSON.parse(readFileSync(profilePath(), "utf8")).personal?.email || null;
  } catch {
    return null;
  }
}

// Character classes. Deliberately excludes look-alikes (O/0, l/1/I) because these
// get retyped by hand from a terminal, and the punctuation is limited to what
// employer portals reliably accept — several reject quotes, backslashes and spaces.
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGIT = "23456789";
const SYMBOL = "!#$%&*+-=?@^_";

const pick = (set) => set[randomInt(set.length)];

/** Fisher-Yates over a crypto RNG — no Math.random anywhere in this file. */
const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Every portal met so far wants the same five things: >= 8 characters, an upper,
 * a lower, a digit and a symbol. Seed one of each, fill the rest from the union,
 * then shuffle so the guaranteed characters are not always in the first four slots.
 */
export function generatePassword(length = 20) {
  if (length < 12) throw new Error("refusing to generate a password shorter than 12 characters");
  const all = LOWER + UPPER + DIGIT + SYMBOL;
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < length) chars.push(pick(all));
  return shuffle(chars).join("");
}

const load = () => (existsSync(store()) ? JSON.parse(readFileSync(store(), "utf8")) : { $schemaVersion: 1, note: "", entries: [] });

const save = (data) => {
  data.note =
    "Employer-portal accounts, keyed by registrable domain. Written by " +
    ".claude/skills/apply-to-jobs/scripts/credentials.mjs. REAL CREDENTIALS — this file is " +
    "private, same no-public-remote rule as profile.json. The agent never creates these " +
    "accounts or types these passwords into a site; the user does, then the agent " +
    "continues the application.";
  const tmp = store() + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, store()); // atomic — a half-written credential store is worse than none
};

// Only run the CLI when invoked directly — generatePassword is importable, and an
// import must not print a usage banner or touch the store.
const RUN_AS_CLI = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => {
  const hits = args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
  return hits.length ? hits : null;
};
const one = (name) => (flag(name) || [null])[0];
const has = (name) => args.includes(`--${name}`);

const mask = (p) => p.slice(0, 2) + "…".repeat(6) + p.slice(-2);

if (!RUN_AS_CLI) {
  // imported as a module: expose generatePassword and do nothing else
} else if (cmd === "add") {
  const domain = one("domain");
  const company = one("company");
  if (!domain || !company) {
    console.error("need --domain and --company");
    process.exit(2);
  }
  const data = load();
  const existing = data.entries.find((e) => e.domain === domain);
  if (existing && !has("force")) {
    console.error(`${domain} already has an entry (login ${existing.login}). Pass --force to replace it.`);
    process.exit(3);
  }
  const entry = {
    domain,
    company,
    login: one("login") || defaultLogin(),
    password: generatePassword(Number(one("length")) || 20),
    url: one("url") || null,
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: "credentials.mjs",
    note: one("note") || null,
  };
  data.entries = data.entries.filter((e) => e.domain !== domain).concat(entry);
  data.entries.sort((a, b) => a.domain.localeCompare(b.domain));
  save(data);
  console.log(`${entry.company}: ${entry.login} - ${entry.password}`);
} else if (cmd === "get") {
  const domain = one("domain");
  const hit = load().entries.find((e) => e.domain === domain);
  if (!hit) {
    console.error(`no entry for ${domain}`);
    process.exit(1);
  }
  console.log(`${hit.company}: ${hit.login} - ${hit.password}`);
} else if (cmd === "handoff") {
  const domains = flag("domain") || [];
  const entries = load().entries.filter((e) => domains.length === 0 || domains.includes(e.domain));
  if (!entries.length) {
    console.error("nothing to hand off");
    process.exit(1);
  }
  for (const e of entries) console.log(`${e.company}: ${e.login} - ${e.password}`);
} else if (cmd === "list") {
  const entries = load().entries;
  if (!entries.length) console.log("(empty)");
  for (const e of entries) {
    console.log(`${e.domain.padEnd(34)} ${e.company.padEnd(12)} ${e.login}  ${has("secrets") ? e.password : mask(e.password)}  ${e.createdAt}`);
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 24).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
