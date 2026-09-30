// Shared deterministic matcher + profile I/O for the apply-to-jobs scripts.
//
// This is the single source of truth for "how close are two question
// phrasings". profile-qa.mjs (interactive lookup/write) and
// resolve-fields.mjs (batch resolution of a whole form) both import it, so a
// question that scores `likely` in one never scores `weak` in the other.

import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// lib/ -> scripts/ -> apply-to-jobs/ -> skills/ -> .claude/ -> repo root
// APPLIER_PROFILE_PATH points the scripts at a different profile — used only by the
// autofill e2e tests, which must never type the real person into a real form.
export const PROFILE_PATH = process.env.APPLIER_PROFILE_PATH
  ? resolve(process.env.APPLIER_PROFILE_PATH)
  : resolve(HERE, "../../../../../profile.json");

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "do", "does", "did", "you", "your", "i",
  "my", "me", "to", "for", "of", "in", "on", "at", "with", "and", "or",
  "this", "that", "have", "has", "be", "been", "will", "would", "can",
  "could", "please", "it", "if", "yes", "no",
]);

export function tokenize(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t));
}

export function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// Score against each stored phrasing (question, then each alias) individually
// and take the best match — NOT a merged bag of question+aliases+tags. A
// merged bag dilutes the score for every entry that has aliases/tags (which
// is every real entry), since union size grows with unrelated alias/tag
// words the query naturally won't contain. Tags are metadata for --tag
// filtering, not phrasing to match against.
export function bestMatchScore(queryTokens, entry) {
  const candidates = [entry.question, ...(entry.aliases || [])];
  let best = 0;
  for (const candidate of candidates) {
    const score = jaccard(queryTokens, tokenize(candidate));
    if (score > best) best = score;
  }
  return best;
}

export function verdictFor(score) {
  if (score > 0.8) return "exact";
  if (score >= 0.5) return "likely";
  if (score >= 0.2) return "weak";
  return "none";
}

// Rank every qa[] entry against one question. Returns [{entry, score,
// verdict}] sorted best-first. Callers decide what to do with a verdict —
// the script never decides "same question" on its own.
export function rankAgainstQa(question, qa) {
  const queryTokens = tokenize(question);
  return qa
    .map((entry) => {
      const score = bestMatchScore(queryTokens, entry);
      return { entry, score, verdict: verdictFor(score) };
    })
    .sort((a, b) => b.score - a.score);
}

export function loadProfile() {
  if (!existsSync(PROFILE_PATH)) {
    console.error(`profile.json not found at ${PROFILE_PATH}`);
    process.exit(1);
  }
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  if (!Array.isArray(profile.qa)) profile.qa = [];
  return profile;
}

export function saveProfile(profile) {
  const tmp = `${PROFILE_PATH}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  renameSync(tmp, PROFILE_PATH);
}
