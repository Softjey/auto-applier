#!/usr/bin/env node
// Phase 3 bridge: take the form.json that browser/extract-form.js produced and
// split every field into "we already know this" and "we must ask the user".
//
// This script never guesses. A field lands in `resolved` only when it maps to
// a structured profile value by an explicit rule below, or matches a qa[]
// entry at `exact`. Everything else — including `likely` — lands in `review`
// or `unknown`, because "same question for the same country/currency" is a
// semantic call that stays with Claude (see SKILL.md § Filling the form).
//
// Usage:
//   resolve-fields.mjs <form.json> [more-form.json ...] [--json]
//
// Exit code is always 0; the report is the product. Feed the `unknown` list of
// every vacancy into ONE batched question round, then re-run to confirm the
// list is empty before any typing starts.

import { readFileSync } from "node:fs";
import { rankAgainstQa, loadProfile } from "./lib/qa-match.mjs";

// Structural facts: fields whose answer is a plain profile lookup, never a
// country-dependent judgment. Keyed by a regex over the field label.
// `\b` is ASCII-only in JS, so it does not fire after "imię" or "płeć".
// Every pattern here is /iu with explicit non-letter edges instead.
const edge = (body) => new RegExp(`(^|[^\\p{L}])(${body})([^\\p{L}]|$)`, "iu");

const STRUCTURAL = [
  // "First and last name" is ONE field asking for both. It has to be tested
  // before the last-name rule, which would otherwise match its tail and answer
  // a full-name field with the surname alone.
  {
    re: edge("full\\s*name|imi[eę] i nazwisko|first\\s*(and|&|\\+|/)\\s*last\\s*name"),
    get: (p) => p.personal?.fullName,
  },
  { re: edge("first\\s*name|imi[eę]|given name"), get: (p) => p.personal?.firstName },
  { re: edge("last\\s*name|surname|nazwisko|family name"), get: (p) => p.personal?.lastName },
  { re: edge("e-?mail|adres e-?mail"), get: (p) => p.personal?.email },
  { re: edge("phone|telefon\\w*|mobile|numer telefonu"), get: (p) => p.personal?.phone },
  { re: edge("linkedin"), get: (p) => p.links?.linkedin },
  { re: edge("github|git hub"), get: (p) => p.links?.github },
  { re: edge("portfolio|website|strona"), get: (p) => p.links?.portfolio },
  { re: edge("city|miasto|town"), get: (p) => p.personal?.currentCity },
  { re: edge("country|kraj"), get: (p) => p.personal?.currentCountry },
  // Bare "Name" (Traffit pairs it with a separate "Surname") means the given
  // name. Kept last so "Full name" / "Company name" match their own rule first.
  {
    re: edge("name|imi[eę]"),
    guard: /(company|firm|file|user|nick|referr|full)/iu,
    get: (p) => p.personal?.firstName,
  },
];

// Language-level questions are asked in a dozen phrasings and in the ATS's own
// language, so match the language NAME rather than the sentence around it, and
// answer from languages[].cefr. Which option on THIS form's scale that maps to
// is Claude's call in Phase 4 — the resolver only supplies the fact.
const LANGUAGES = [
  { re: edge("english|angielski\\w*"), name: "English" },
  { re: edge("polish|polski\\w*|polskiego"), name: "Polish" },
  { re: edge("ukrainian|ukrai[nń]ski\\w*"), name: "Ukrainian" },
];
const LEVEL_RE = /(level|proficiency|stopie[nń]|znajomo[sś]ci|proficien)/iu;

// Consent / GDPR checkboxes are a policy decision, not a fact lookup: the
// mandatory one is inherent to applying, anything broader is declined.
const CONSENT_RE = /(consent|zgod[aęy]|przetwarzanie danych|gdpr|rodo|processing of my personal data)/iu;

// Open-ended prose Claude may draft (grounded only in the tailored resume and
// profile.json). The negative half matters more than the positive half: a
// question naming something the user BUILT, SHIPPED or WORKED ON is a factual
// question wearing narrative clothes, and drafting it from adjacent CV bullets
// produces confident nonsense. Those stay `unknown` and get asked.
const NARRATIVE_RE = /(why (do you want|this|are you)|what (interests|attracts)|describe your|how would you describe|cover letter|motivation|leave us a message|tell us about yourself|about you)/iu;
const BUILT_RE = /(you'?ve? (built|created|made|developed|shipped|written)|tools you|projects you|have you built|worked on)/iu;

// Voluntary demographic fields: answered from policy, never escalated.
const EEO_RE = /\b(gender|race|ethnic|veteran|disability|p[lł]e[cć]|sexual orientation)\b/i;

// Fields the agent fills from run state rather than from the profile.
const RUNTIME = [
  { re: /\b(cv|resume|curriculum|plik cv|life)\b/i, note: "the tailored PDF generated in Phase 1" },
];

function classify(field, profile) {
  const label = field.label || field.key || "";

  if (field.kind === "honeypot") {
    return { status: "skip", why: "anti-autofill honeypot — writing here loses the answer" };
  }
  if (field.kind === "file" || RUNTIME.some((r) => r.re.test(label))) {
    return { status: "runtime", why: RUNTIME[0].note };
  }
  if (EEO_RE.test(label)) {
    return { status: "resolved", source: "profile.eeo.policy", value: profile.eeo?.policy || "decline" };
  }

  if (CONSENT_RE.test(label)) {
    const future = /(future|przysz[lł]|kolejnych|marketing|other recruitment)/iu.test(label);
    return {
      status: "resolved",
      source: "consent policy",
      value: future
        ? "LEAVE UNCHECKED — broader than this one application"
        : "CHECK — mandatory for this application; show it at the confirmation pause",
    };
  }

  if (LEVEL_RE.test(label)) {
    const hit = LANGUAGES.find((l) => l.re.test(label));
    if (hit) {
      const entry = (profile.languages || []).find((l) => l.language === hit.name);
      if (entry) {
        return {
          status: "resolved",
          source: "profile.languages[].cefr",
          value: `${entry.cefr || entry.level} — pick the closest option on this form's own scale`,
        };
      }
    }
  }

  if (NARRATIVE_RE.test(label) && !BUILT_RE.test(label)) {
    return {
      status: "narrative",
      why: "Claude may draft 1-2 sentences, grounded only in the tailored resume and profile.json; flag the text in the run summary",
    };
  }

  for (const rule of STRUCTURAL) {
    if (rule.guard && rule.guard.test(label)) continue;
    if (rule.re.test(label)) {
      const value = rule.get(profile);
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
        ...classify(field, profile),
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

main();
