// The credential store behind both the `credentials.mjs` CLI and the autofill
// extension's password manager (via the local server). One file, one set of rules.
//
// The store is `credentials.json` in the private data repo — real passwords, so the
// same no-public-remote rule as profile.json. Nothing here knows about the browser:
// it takes an origin string and a file path, which is what keeps it testable.
//
// Format (schema 2). Schema 1 only lacked `id`, `verified`, `updatedAt` and
// `lastUsedAt`; `normalize` adds them on read, so an old file keeps working and is
// upgraded the next time anything is saved.
//
//   { "$schemaVersion": 2, "note": "...",
//     "entries": [ { "id", "domain", "company", "login", "password", "url",
//                    "verified", "createdAt", "updatedAt", "lastUsedAt",
//                    "createdBy", "note" } ] }
//
// `domain` is the exact host the login was made on ("acme.wd3.myworkdayjobs.com"):
// employer portals are multi-tenant, and one tenant's account is not another's.

import { createHash, randomInt } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export const SCHEMA_VERSION = 2;

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
 * then shuffle so the guaranteed characters are not always in the first slots.
 * `alphanumeric` drops the symbol for the portals that reject punctuation.
 */
export function generatePassword(length = 20, { alphanumeric = false } = {}) {
  if (length < 12) throw new Error("refusing to generate a password shorter than 12 characters");
  const all = LOWER + UPPER + DIGIT + (alphanumeric ? "" : SYMBOL);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGIT), ...(alphanumeric ? [] : [pick(SYMBOL)])];
  while (chars.length < length) chars.push(pick(all));
  return shuffle(chars).join("");
}

// ---------------------------------------------------------------------------
// Hosts: which saved login may be offered on which page.

// Hosts where one registrable domain serves many unrelated employers. Their logins
// are exact-host only: "acme.wd3.myworkdayjobs.com" must never offer "beta.wd3…" its
// password, and a bare "myworkdayjobs.com" entry must never match every tenant.
const MULTI_TENANT = new Set([
  "myworkdayjobs.com", "myworkdaysite.com", "workday.com", "greenhouse.io", "lever.co",
  "smartrecruiters.com", "ashbyhq.com", "teamtailor.com", "bamboohr.com", "taleo.net",
  "icims.com", "successfactors.com", "successfactors.eu", "oraclecloud.com", "jobvite.com",
  "recruitee.com", "workable.com", "personio.de", "personio.com", "traffit.com",
  "erecruiter.pl", "pinpointhq.com", "breezy.hr", "applytojob.com", "jazz.co",
  "avature.net", "dayforcehcm.com", "paylocity.com", "ultipro.com", "kenexa.com",
  "brassring.com", "csod.com", "hirehive.com", "join.com", "comeet.co", "rippling.com",
  "eightfold.ai", "phenom.com", "careers-page.com", "myworkday.com", "wd1.myworkdayjobs.com",
  "github.io", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev", "azurewebsites.net",
]);

// Public suffixes of two labels the registrable-domain guess has to know about.
const TWO_LABEL_SUFFIX = new Set([
  "co.uk", "org.uk", "ac.uk", "com.pl", "net.pl", "org.pl", "com.au", "net.au", "co.nz",
  "co.jp", "com.br", "co.in", "com.ua", "co.za", "com.mx", "com.tr", "co.il", "com.sg",
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Lower-cased host without a leading "www." */
export const normalizeHost = (host) => String(host).toLowerCase().replace(/^www\./, "");

export function registrable(host) {
  const h = normalizeHost(host);
  if (IPV4.test(h) || !h.includes(".")) return h;
  const labels = h.split(".");
  const last2 = labels.slice(-2).join(".");
  return TWO_LABEL_SUFFIX.has(last2) && labels.length >= 3 ? labels.slice(-3).join(".") : last2;
}

/** {host, secure} of an origin/URL string, or null when it is not an http(s) page. */
export function parseOrigin(origin) {
  let url;
  try {
    url = new URL(origin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = normalizeHost(url.hostname);
  const loopback = host === "localhost" || host === "127.0.0.1";
  return { host, secure: url.protocol === "https:" || loopback };
}

/**
 * How a saved login's domain fits a page host: "exact", "related" (same registrable
 * domain, not a multi-tenant host) or null. Dot-boundary only — "evil-acme.com" is not
 * "acme.com" — and never across a multi-tenant suffix.
 */
export function matchLevel(entryDomain, pageHost) {
  const entry = normalizeHost(entryDomain);
  const page = normalizeHost(pageHost);
  if (entry === page) return "exact";
  const reg = registrable(page);
  if (reg !== registrable(entry)) return null;
  if (MULTI_TENANT.has(reg) || MULTI_TENANT.has(page) || MULTI_TENANT.has(entry)) return null;
  return "related";
}

// ---------------------------------------------------------------------------
// The file.

export const entryId = (domain, login) =>
  createHash("sha1").update(`${normalizeHost(domain)}\0${login.toLowerCase()}`).digest("hex").slice(0, 12);

const today = () => new Date().toISOString().slice(0, 10);

/**
 * An entry the user marked as never having worked ("status": "UNUSED — …": a password that was
 * generated and handed over but never submitted anywhere). It is kept as a record, never offered.
 */
export const isDead = (entry) => /^UNUSED/i.test(String(entry.status ?? ""));

function normalize(entry) {
  return {
    ...entry, // fields this code does not know (a hand-written `status`) survive a rewrite
    id: entry.id || entryId(entry.domain, entry.login),
    domain: normalizeHost(entry.domain),
    company: entry.company ?? null,
    login: entry.login,
    password: entry.password,
    url: entry.url ?? null,
    verified: isDead(entry) ? false : (entry.verified ?? true), // schema-1 entries were made by hand, then used
    createdAt: entry.createdAt ?? today(),
    updatedAt: entry.updatedAt ?? entry.createdAt ?? today(),
    lastUsedAt: entry.lastUsedAt ?? null,
    createdBy: entry.createdBy ?? "credentials.mjs",
    note: entry.note ?? null,
  };
}

export function loadStore(file) {
  if (!existsSync(file)) return { $schemaVersion: SCHEMA_VERSION, note: "", entries: [] };
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return { ...raw, $schemaVersion: SCHEMA_VERSION, entries: (raw.entries ?? []).map(normalize) };
}

export function saveStore(file, data) {
  data.$schemaVersion = SCHEMA_VERSION;
  data.note =
    "Employer-portal accounts, one entry per (domain, login). Written by " +
    ".claude/skills/apply-to-jobs/scripts/credentials.mjs and by the autofill extension's " +
    "password manager. REAL CREDENTIALS — this file is private, same no-public-remote rule " +
    "as profile.json. `verified: false` is an account the extension created that no " +
    "sign-in has confirmed yet.";
  data.entries.sort((a, b) => a.domain.localeCompare(b.domain) || a.login.localeCompare(b.login));
  const tmp = file + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, file); // atomic — a half-written credential store is worse than none
}

/** An entry without its password: all a page-side script is shown until a fill. */
export const summarize = (entry, level) => ({
  id: entry.id,
  domain: entry.domain,
  login: entry.login,
  level,
  verified: entry.verified,
  lastUsedAt: entry.lastUsedAt,
});

const byRelevance = (a, b) =>
  (a.level === "exact" ? 0 : 1) - (b.level === "exact" ? 0 : 1) ||
  Number(b.verified) - Number(a.verified) ||
  (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "");

/** Saved logins that may be offered on `origin`, best first. Empty on an insecure page. */
export function findMatches(file, origin) {
  const page = parseOrigin(origin);
  if (!page?.secure) return [];
  return loadStore(file)
    .entries.flatMap((e) => {
      const level = isDead(e) ? null : matchLevel(e.domain, page.host);
      return level ? [summarize(e, level)] : [];
    })
    .sort(byRelevance);
}

/** The login and password of entry `id` — only if it matches `origin`. Null otherwise. */
export function reveal(file, origin, id) {
  const page = parseOrigin(origin);
  if (!page?.secure) return null;
  const store = loadStore(file);
  const entry = store.entries.find((e) => e.id === id);
  if (!entry || isDead(entry) || !matchLevel(entry.domain, page.host)) return null;
  entry.lastUsedAt = new Date().toISOString();
  saveStore(file, store);
  return { login: entry.login, password: entry.password };
}

/**
 * Remember a login proven (or about to be tried) on `origin`. Same (host, login) with a
 * different password updates it; the same password is a no-op apart from `verified`.
 */
export function saveLogin(file, { origin, login, password, verified = true, createdBy = "extension", company = null, note = null }) {
  const page = parseOrigin(origin);
  if (!page?.secure) throw new Error("refusing to save a login for an insecure page");
  const store = loadStore(file);
  const id = entryId(page.host, login);
  const existing = store.entries.find((e) => e.id === id);
  if (!existing) {
    store.entries.push(
      normalize({ domain: page.host, login, password, verified, createdBy, company, note, url: origin }),
    );
    saveStore(file, store);
    return { id, result: "created" };
  }
  const revived = isDead(existing);
  const changed = revived || existing.password !== password;
  const nowVerified = (!revived && existing.verified) || verified;
  if (!changed && nowVerified === existing.verified) return { id, result: "unchanged" };
  if (revived) delete existing.status;
  existing.password = password;
  existing.verified = nowVerified;
  existing.updatedAt = today();
  saveStore(file, store);
  return { id, result: changed ? "updated" : "unchanged" };
}

/**
 * A new account for `origin`: login chosen by the caller (the profile e-mail), password
 * generated here and SAVED AT ONCE as unverified — if the page eats the submit, the
 * password is not lost. Asking again for the same (host, login) hands back the stored
 * draft's password rather than minting a second one, unless `regenerate`.
 */
export function draftAccount(file, { origin, login, length = 20, alphanumeric = false, regenerate = false, company = null }) {
  const page = parseOrigin(origin);
  if (!page?.secure) throw new Error("refusing to create an account on an insecure page");
  const store = loadStore(file);
  const id = entryId(page.host, login);
  const existing = store.entries.find((e) => e.id === id);
  if (existing && !isDead(existing) && (existing.verified || !regenerate)) {
    return { id, login, password: existing.password };
  }
  const password = generatePassword(length, { alphanumeric });
  if (existing) {
    delete existing.status; // a dead record is replaced by this live draft
    existing.password = password;
    existing.updatedAt = today();
  } else {
    store.entries.push(
      normalize({ domain: page.host, login, password, verified: false, createdBy: "extension", company, url: origin }),
    );
  }
  saveStore(file, store);
  return { id, login, password };
}

/**
 * Compare what a page just accepted with what is stored: "new", "changed" (same login,
 * other password) or "same". "same" is the proof an account works, so it is recorded here:
 * the entry becomes verified and its last-used time moves.
 */
export function checkLogin(file, { origin, login, password }) {
  const page = parseOrigin(origin);
  if (!page?.secure) return "same"; // never offer to store anything for an insecure page
  const store = loadStore(file);
  const existing = store.entries.find((e) => e.id === entryId(page.host, login));
  if (!existing) return "new";
  if (isDead(existing) || existing.password !== password) return "changed";
  existing.verified = true;
  existing.lastUsedAt = new Date().toISOString();
  saveStore(file, store);
  return "same";
}

export function markVerified(file, origin, id) {
  const page = parseOrigin(origin);
  const store = loadStore(file);
  const entry = store.entries.find((e) => e.id === id);
  if (!page || !entry || !matchLevel(entry.domain, page.host)) return false;
  entry.verified = true;
  entry.updatedAt = today();
  saveStore(file, store);
  return true;
}

export function removeEntry(file, origin, id) {
  const page = parseOrigin(origin);
  const store = loadStore(file);
  const entry = store.entries.find((e) => e.id === id);
  if (!page || !entry || !matchLevel(entry.domain, page.host)) return false;
  store.entries = store.entries.filter((e) => e.id !== id);
  saveStore(file, store);
  return true;
}
