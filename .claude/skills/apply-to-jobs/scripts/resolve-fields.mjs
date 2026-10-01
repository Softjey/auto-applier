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
import { themesFor, looksLikeAbout } from "./lib/story-themes.mjs";

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

// A qa[] answer may end in a note to the agent: "3-4 years (choose the 3-4 bracket where
// offered; where a single number is required, 3)". Picking an option from a list reads the
// answer's start; a box would receive the note itself. A `write exactly "X"` note names
// the text; any other note on a typed answer is the agent's call.
const CHOICE_KINDS = new Set(["checkbox", "checkbox-group", "radio", "radio-group", "select", "combobox"]);
const GUIDANCE = /\((?:[^)]*\b(?:choose|pick|select|write|type|where|if|use)\b)[^)]*\)/i;

export function typeableAnswer(answer, kind) {
  const exact = /write exactly\s+["“]([^"”]+)["”]/i.exec(answer);
  if (exact && !CHOICE_KINDS.has(kind)) return { ok: true, value: exact[1] };
  // "...where a single number is required, 3": a typed years-of-experience box takes that number.
  const single = /single number[^,)]*,\s*(\d+(?:[.,]\d+)?)/i.exec(answer);
  if (single && !CHOICE_KINDS.has(kind)) return { ok: true, value: single[1] };
  if (CHOICE_KINDS.has(kind)) return { ok: true, value: answer };
  // "B2B — the compensation anchor in profile.json is 150 PLN/h net …": an explanation for the
  // agent after a dash. A box takes the short lead only ("B2B"); a lead that is itself long means
  // the whole answer is prose written for the agent, and a person would not type it.
  const [lead, ...rest] = answer.split(/\s[—–]\s/);
  if (rest.length > 0 && AGENT_NOTE.test(rest.join(" "))) {
    return lead.length <= LEAD_MAX ? { ok: true, value: lead.trim() } : { ok: false };
  }
  // The whole answer is an instruction to the agent ("Tick it when mandatory", "Leave blank.
  // Standing policy…", "Pick the earliest option"), or is too long to be a value a person types
  // into a box: the agent reads it and decides.
  if (GUIDANCE.test(answer) || INSTRUCTION.test(answer) || answer.length > TYPED_MAX) {
    return { ok: false };
  }
  return { ok: true, value: answer };
}

/**
 * What a form field receives from a qa[] entry. An entry has two voices:
 *   answer — what the AGENT reads: the fact with its how-and-when ("B2B — the anchor is …",
 *            "Tick it when mandatory");
 *   value  — the exact text a person would type ("B2B"); `null` = never typed, only the agent
 *            decides (a standing policy, a rule);
 *   pick   — what to look for in a list or radio group when that is not `answer`.
 * A list or radio matches `pick`, else `answer`. A box takes `value`. An entry with no `value`
 * is a legacy one: its `answer` goes through the typeableAnswer heuristic, which hands anything
 * that reads as an instruction back to the agent.
 */
export function formValue(entry, kind) {
  if (CHOICE_KINDS.has(kind)) return { ok: true, value: entry.pick ?? entry.answer };
  if (entry.value === null) {
    return { ok: false, why: "this entry is a rule for the agent (value: null) — read it and decide; nothing is typed from it" };
  }
  if (typeof entry.value === "string") return { ok: true, value: entry.value };
  const typed = typeableAnswer(entry.answer, kind);
  return typed.ok
    ? typed
    : { ok: false, why: "the recorded answer carries instructions for the agent, not text to type into a box — read it and type the value (or give the entry a `value`)" };
}

const LEAD_MAX = 40;
const TYPED_MAX = 160;
// Words that only an instruction to the agent contains.
const AGENT_NOTE = /\b(profile\.json|profile records|the cv shows|qa\[\]|anchor|derive|standing policy|stated by the user|never pick|never (?:volunteer|answer)|pick the|choose the|where offered|escalate)\b/i;
const INSTRUCTION = /\b(tick it|leave (?:it )?(?:blank|empty|unticked)|standing policy|stated by the user|the user\b|user answers|pick the|choose the|top option|highest option|middle(?:-high)? option|recompute|enter only|skills\.csv|never pick|never volunteer|when the form|if a form|where offered|escalate|for other stacks)/i;

export function classify(field, profile, vocab) {
  const label = field.label || field.key || "";

  if (field.kind === "honeypot") {
    return { status: "skip", why: "anti-autofill honeypot — writing here loses the answer" };
  }
  // A CONSENT or a yes/no question can mention the CV ("...data contained in my CV") without
  // being a place to put one. Only a file control, or a free-form box, is a CV field by label.
  const isChoice = ["checkbox", "checkbox-group", "radio", "radio-group", "select", "combobox"].includes(field.kind);
  if (field.kind === "file" || (!isChoice && matches(vocab.topic.cvUpload, label))) {
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

  // A recorded answer to this very question beats the loose structural vocabulary.
  // The structural rules match single words ("country", "mobile", "name", "address"),
  // so without this a qa[] answer was shadowed: "authorized to work in this country?"
  // came back "Poland", "Experience shipping mobile apps" came back the phone number,
  // a street-address field came back the first name.
  const ranked = rankAgainstQa(label, profile.qa);
  const top = ranked[0];
  if (top?.verdict === "exact") {
    const typed = formValue(top.entry, field.kind);
    if (typed.ok) {
      return { status: "resolved", source: `qa:${top.entry.id}`, value: typed.value, score: +top.score.toFixed(2) };
    }
    return {
      status: "review",
      why: typed.why,
      candidates: [{ id: top.entry.id, q: top.entry.question, a: top.entry.answer, score: +top.score.toFixed(2) }],
    };
  }

  for (const [key, get] of STRUCTURAL) {
    if (matches(vocab.guard[key], label)) continue;
    if (matches(vocab.field[key], label)) {
      const value = get(profile);
      if (value) return { status: "resolved", source: "profile (structured)", value };
    }
  }

  // An open text box that asks for an event ("the hardest problem you solved", "a time
  // you disagreed", "what are you proud of", "tell us about yourself") is answered
  // from stories.json, not from qa[] — stories never live in qa[]. Only when no qa[]
  // entry is a real candidate (none / weak): a "likely" one is still Claude's call.
  // Free-text boxes only; a theme word inside a radio or a yes/no is a fact question.
  if (field.kind === "textarea" && (!top || top.verdict === "none" || top.verdict === "weak")) {
    const themes = Object.keys(themesFor(label));
    if (themes.length || looksLikeAbout(label)) {
      return {
        status: "narrative",
        why: `a story question (${looksLikeAbout(label) ? "about-me" : themes.join(", ")}) — node stories.mjs find "<the question>", ground it in one story; flag the text in the run summary`,
      };
    }
  }

  if (!top || top.verdict === "none") {
    return { status: "unknown", why: "no qa[] entry comes close", candidates: [] };
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
