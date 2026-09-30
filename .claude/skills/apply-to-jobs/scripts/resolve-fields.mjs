#!/usr/bin/env node
// Phase 3 bridge: take the form.json that browser/extract-form.js produced and
// split every field into "we already know this" and "we must ask the user".
//
// This script never guesses. A field lands in `resolved` only when it maps to
// a structured profile value by an explicit rule below, or matches a qa[]
// entry at `exact`. Everything else — including `likely` — lands in `review`
// or `unknown`, because "same question for the same country/currency" is a
// semantic call that stays with Claude (see SKILL.md).
//
// All label vocabulary lives in lib/field-labels.mjs (English) plus the user's
// own apply-config.json (every other language). Nothing locale-specific
// belongs in this file.
//
// Usage:
//   resolve-fields.mjs <form.json> [more-form.json ...] [--json]
//
// Exit code is always 0; the report is the product. Feed the `unknown` list of
// every vacancy into ONE batched question round, then re-run to confirm the
// list is empty before any typing starts.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { rankAgainstQa, loadProfile } from "./lib/qa-match.mjs";
import { buildVocabulary, matches } from "./lib/field-labels.mjs";

// Order is load-bearing. "First and last name" is ONE field asking for both,
// and it has to be tested before the last-name rule, which would otherwise
// match its tail and answer a full-name field with the surname alone. `bareName`
// stays last so every more specific rule gets first refusal.
const STRUCTURAL = [
  ["fullName", (p) => p.personal?.fullName],
  ["firstName", (p) => p.personal?.firstName],
  ["lastName", (p) => p.personal?.lastName],
  ["email", (p) => p.personal?.email],
  ["phone", (p) => p.personal?.phone],
  ["linkedin", (p) => p.links?.linkedin],
  ["github", (p) => p.links?.github],
  ["portfolio", (p) => p.links?.portfolio],
  ["city", (p) => p.personal?.currentCity],
  ["country", (p) => p.personal?.currentCountry],
  ["bareName", (p) => p.personal?.firstName],
];

export function classify(field, profile, vocab) {
  const label = field.label || field.key || "";

  if (field.kind === "honeypot") {
    return { status: "skip", why: "anti-autofill honeypot — writing here loses the answer" };
  }
  if (field.kind === "file" || matches(vocab.topic.cvUpload, label)) {
    return { status: "runtime", runtime: "cv", why: "the tailored PDF generated in Phase 1" };
  }
  if (matches(vocab.topic.eeo, label)) {
    return { status: "resolved", source: "profile.eeo.policy", value: profile.eeo?.policy || "decline" };
  }

  if (matches(vocab.topic.consent, label)) {
    const future = matches(vocab.topic.futureConsent, label);
    return {
      status: "resolved",
      source: "consent policy",
      value: future
        ? "LEAVE UNCHECKED — broader than this one application"
        : "CHECK — mandatory for this application; show it at the confirmation pause",
    };
  }

  // Language-level questions are asked in a dozen phrasings and in the form's
  // own language, so match the language NAME rather than the sentence around
  // it. Which option on THIS form's scale the level maps to is Claude's call in
  // Phase 4 — the resolver only supplies the fact.
  if (matches(vocab.topic.languageLevel, label)) {
    const hit = vocab.languages.find((l) => matches(l.re, label));
    if (hit) {
      return {
        status: "resolved",
        source: "profile.languages[]",
        value: `${hit.entry.cefr || hit.entry.level} — pick the closest option on this form's own scale`,
      };
    }
  }

  // Money is the one answer that is neither a profile lookup nor a question for
  // the user: it is a function of the band THIS vacancy published. Catching it
  // here — before qa[] gets a chance — is deliberate. The qa[] salary entries
  // are only the no-band baseline, and letting one of them resolve a field
  // would quietly submit that baseline to an employer who published 45k.
  if (matches(vocab.topic.salary, label)) {
    return {
      status: "runtime",
      runtime: "salary",
      why: "compute for THIS vacancy: node scripts/salary-quote.mjs (profile.compensation.strategy). Never answer from a qa[] baseline",
    };
  }

  if (matches(vocab.topic.narrative, label) && !matches(vocab.topic.built, label)) {
    return {
      status: "narrative",
      why: "Claude may draft 1-2 sentences, grounded only in the tailored resume, profile.json and stories.json; flag the text in the run summary",
    };
  }

  for (const [key, get] of STRUCTURAL) {
    if (matches(vocab.guard[key], label)) continue;
    if (matches(vocab.field[key], label)) {
      const value = get(profile);
      if (value) return { status: "resolved", source: "profile (structured)", value };
    }
  }

  const ranked = rankAgainstQa(label, profile.qa);
  const top = ranked[0];
  if (!top || top.verdict === "none") {
    return { status: "unknown", why: "no qa[] entry comes close", candidates: [] };
  }
  if (top.verdict === "exact") {
    return { status: "resolved", source: `qa:${top.entry.id}`, value: top.entry.answer, score: +top.score.toFixed(2) };
  }
  // likely / weak -> Claude must read both questions and decide.
  return {
    status: "review",
    why: `best match is ${top.verdict} (${top.score.toFixed(2)}) — confirm it asks the same thing`,
    candidates: ranked.slice(0, 3).map((r) => ({ id: r.entry.id, q: r.entry.question, a: r.entry.answer, score: +r.score.toFixed(2) })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const paths = args.filter((a) => !a.startsWith("--"));
  if (paths.length === 0) {
    console.error("Usage: resolve-fields.mjs <form.json> [...] [--json]");
    process.exit(1);
  }
  const profile = loadProfile();
  const vocab = buildVocabulary(profile);
  const report = [];

  for (const path of paths) {
    const form = JSON.parse(readFileSync(path, "utf8"));
    const out = { path, host: form.host, url: form.url, hasRecaptcha: !!form.hasRecaptcha, fields: [] };
    for (const field of form.fields || []) {
      out.fields.push({
        label: field.label,
        key: field.key,
        kind: field.kind,
        required: !!field.required,
        options: field.options,
        optionsHidden: !!field.optionsHidden,
        ...classify(field, profile, vocab),
      });
    }
    report.push(out);
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 1));
    return;
  }

  let blocking = 0;
  for (const form of report) {
    console.log(`\n=== ${form.host} — ${form.path}`);
    if (form.hasRecaptcha) console.log("  ! page carries a reCAPTCHA — stop if it ever demands solving");
    const by = (s) => form.fields.filter((f) => f.status === s);
    const show = (title, list, withWhy) => {
      if (!list.length) return;
      console.log(`  ${title}`);
      for (const f of list) {
        const req = f.required ? "*" : " ";
        console.log(`   ${req} [${f.kind}] ${f.label || f.key}`);
        if (f.value !== undefined) console.log(`       -> ${String(f.value).slice(0, 90)}   (${f.source})`);
        if (withWhy && f.why) console.log(`       ?? ${f.why}`);
        for (const c of f.candidates || []) console.log(`          ~ ${c.score} ${c.id}: ${c.q}`);
        if (f.optionsHidden) console.log("       (options load only on click — read them in Phase 4)");
        else if (f.options?.length)
          console.log(`       options: ${f.options.slice(0, 8).map((o) => (typeof o === "string" ? o : o.label)).join(" | ")}`);
      }
    };
    show("RESOLVED", by("resolved"));
    show("RUNTIME", by("runtime"), true);
    show("SKIP", by("skip"), true);
    show("NARRATIVE — Claude drafts these, 1-2 sentences, no new claims", by("narrative"), true);
    show("REVIEW — Claude must confirm these are the same question", by("review"), true);
    show("UNKNOWN — must be asked before any typing", by("unknown"), true);
    blocking += by("unknown").filter((f) => f.required).length + by("review").filter((f) => f.required).length;
  }
  console.log(`\n${blocking} required field(s) still need a human answer across ${report.length} form(s).`);
}

// Only run as a CLI: autofill/server.mjs imports classify() from here.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
