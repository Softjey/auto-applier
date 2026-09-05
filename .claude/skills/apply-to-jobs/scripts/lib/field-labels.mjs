// Vocabulary layer for resolve-fields.mjs.
//
// Application forms are written in whatever language the employer hires in, so
// "what does this field label mean" is a translation problem, not a logic one.
// Keeping the two apart is the whole point of this file:
//
//   * The vocabulary built in HERE is ENGLISH ONLY, on purpose. This skill ships
//     as a general-purpose tool; it must not carry one user's job market baked
//     into its source.
//   * Every other language lives in the user's own `apply-config.json` at the
//     repo root, alongside profile.json, and is merged on top at load time.
//     Nothing in .claude/ ever has to change to support a new locale.
//
// Phrases, not regexes. A pack is a plain list of strings so that adding a
// locale needs no regex knowledge:
//
//   "e-mail address"   matches that phrase, with any spacing
//   "telephone*"       a trailing * matches any letter suffix, which is what
//                      makes heavily inflected languages tractable: one entry
//                      covers every case ending the word takes on a form
//
// Matching is always bounded by non-letter edges, so "name" does not fire
// inside "surname". JS `\b` is ASCII-only and would misfire around accented
// letters, hence the explicit \p{L} edges below.

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// lib/ -> scripts/ -> apply-to-jobs/ -> skills/ -> .claude/ -> repo root
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const CONFIG_PATH = join(REPO_ROOT, "apply-config.json");

// ---------------------------------------------------------------- phrases

// Curly apostrophes and backticks are the same character to a reader and a
// different one to a regex, so normalise before any test.
export const normalizeLabel = (text) => (text || "").replace(/[‘’ʼ`]/g, "'");

const escapeLiteral = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function phraseToPattern(phrase) {
  const prefix = phrase.endsWith("*");
  const body = escapeLiteral(prefix ? phrase.slice(0, -1) : phrase).replace(/\s+/g, "\\s*");
  return prefix ? `${body}\\p{L}*` : body;
}

// One regex per rule rather than one per phrase: a single alternation is both
// faster and easier to read when debugging why a label matched.
export function phrasesToRegex(phrases) {
  const body = phrases.filter(Boolean).map(phraseToPattern).join("|");
  if (!body) return null;
  return new RegExp(`(^|[^\\p{L}])(${body})([^\\p{L}]|$)`, "iu");
}

export const matches = (re, label) => !!re && re.test(normalizeLabel(label));

// ---------------------------------------------------------------- English base

// Structural fields: the answer is a plain profile lookup, never a
// country-dependent judgment. Order matters — see resolve-fields.mjs.
export const FIELD_PHRASES = {
  fullName: [
    "full name",
    "first and last name",
    "first & last name",
    "first + last name",
    "first/last name",
    "name and surname",
  ],
  firstName: ["first name", "given name", "forename"],
  lastName: ["last name", "surname", "family name"],
  email: ["email", "e-mail", "email address", "e-mail address"],
  phone: ["phone", "phone number", "mobile", "mobile phone", "telephone", "cell"],
  linkedin: ["linkedin", "linkedin profile", "linkedin url"],
  github: ["github", "git hub", "github profile", "github url"],
  portfolio: ["portfolio", "website", "personal website", "portfolio url"],
  city: ["city", "town", "current city"],
  country: ["country", "current country"],
  // Bare "Name" — some forms pair it with a separate "Surname" field, so it
  // means the given name. Guarded and tested last; see FIELD_GUARDS.
  bareName: ["name"],
};

// A structural rule is skipped outright when its guard matches: "Company name"
// and "File name" are not the candidate's first name.
export const FIELD_GUARDS = {
  bareName: ["company", "company name", "firm", "file", "file name", "user", "username", "nickname", "referrer", "referral", "full"],
};

// Topic detectors. These classify a field by what KIND of question it is,
// before any per-field lookup runs.
export const TOPIC_PHRASES = {
  // Paired with a language name to resolve "English level" from the profile.
  languageLevel: ["level", "proficiency", "proficien*", "language level", "command of"],

  // Consent / GDPR checkboxes are a policy decision, not a fact lookup.
  // Deliberately NARROW. A broad list ("i agree", "privacy policy") swallows
  // things that are not data-processing consents at all — a "I'm creating an
  // account, I accept the Terms of Service" box is account creation, which is
  // out of scope and must never be auto-ticked. Anything not clearly a data
  // consent is better left to escalate than silently resolved.
  consent: ["consent", "i consent", "gdpr", "processing of my personal data", "data processing"],
  // The subset of consents that reach beyond this one application and are
  // therefore always declined.
  futureConsent: ["future", "future recruitment", "further recruitment", "other recruitment", "upcoming", "marketing", "newsletter"],

  // Open-ended prose the agent may draft, grounded only in the tailored resume,
  // profile.json and stories.json.
  narrative: [
    "why do you want", "why this", "why are you", "why us",
    "what interests", "what attracts", "describe your", "how would you describe",
    "cover letter", "motivation", "leave us a message",
    "tell us about yourself", "about you", "a few words about",
  ],
  // The negative half of the narrative test, and it matters more than the
  // positive half: a question naming something the candidate BUILT or SHIPPED
  // is a factual question wearing narrative clothes. Drafting it from adjacent
  // CV bullets produces confident nonsense, so these stay `unknown` and get
  // asked.
  built: [
    "you built", "you've built", "you have built", "have you built",
    "you created", "you've created", "you made", "you've made",
    "you developed", "you've developed", "you shipped", "you've shipped",
    "you wrote", "you've written", "tools you", "projects you", "worked on",
  ],

  // Voluntary demographic fields: answered from policy, never escalated.
  eeo: ["gender", "sex", "race", "ethnic*", "veteran", "disability", "sexual orientation"],

  // Money. Deliberately NOT resolved from the profile or from qa[]: the figure
  // depends on the band THIS vacancy published, so it is computed per vacancy
  // by scripts/salary-quote.mjs (see resolve-fields.mjs). Phrases are narrow on
  // purpose — bare "rate" and bare "pay" appear in "rate your proficiency" and
  // "pay attention", which are not salary questions.
  salary: [
    "salary", "salaries", "compensation", "remuneration", "earnings", "wage",
    "expected salary", "desired salary", "salary expectation*", "expected compensation",
    "desired pay", "expected pay", "pay expectation*", "compensation expectation*",
    "financial expectation*", "hourly rate", "daily rate", "day rate",
    "expected rate", "rate expectation*", "your rate", "how much do you expect",
  ],

  // Filled from run state rather than from the profile.
  cvUpload: ["cv", "resume", "curriculum vitae", "curriculum", "cv file", "attach your cv"],
};

// ---------------------------------------------------------------- config merge

const asArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

export function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    console.error(`Ignoring unreadable ${CONFIG_PATH}: ${err.message}`);
    return {};
  }
}

// Merge, never replace. A locale pack adds phrasings; it can't delete the
// English ones, so a form that mixes languages (common on Greenhouse tenants
// hiring across borders) still resolves.
function merged(base, extra) {
  const out = {};
  for (const [key, phrases] of Object.entries(base)) {
    out[key] = [...phrases, ...asArray(extra?.[key])];
  }
  for (const [key, phrases] of Object.entries(extra || {})) {
    if (!out[key]) out[key] = asArray(phrases);
  }
  return out;
}

// Language matchers are derived from profile.languages[] rather than from a
// list in this file: the languages that matter are exactly the ones the
// candidate speaks. `languageAliases` in the config supplies how each is
// spelled on a form in another language.
function buildLanguageRules(profile, aliases) {
  return (profile.languages || [])
    .filter((entry) => entry.language)
    .map((entry) => ({
      name: entry.language,
      entry,
      re: phrasesToRegex([entry.language, `${entry.language}*`, ...asArray(aliases?.[entry.language])]),
    }))
    .filter((rule) => rule.re);
}

// The one thing every caller needs: compiled regexes for this user's locale.
export function buildVocabulary(profile, config = loadConfig()) {
  const vocab = config.formVocabulary || {};
  const fields = merged(FIELD_PHRASES, vocab.fields);
  const guards = merged(FIELD_GUARDS, vocab.guards);
  const topics = merged(TOPIC_PHRASES, vocab.topics);

  const compile = (map) =>
    Object.fromEntries(Object.entries(map).map(([key, phrases]) => [key, phrasesToRegex(phrases)]));

  return {
    field: compile(fields),
    guard: compile(guards),
    topic: compile(topics),
    languages: buildLanguageRules(profile, vocab.languageAliases),
  };
}
