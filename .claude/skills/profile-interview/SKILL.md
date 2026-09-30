---
name: profile-interview
description: Populate or refresh profile.json's structured facts (contact info, work authorization, location/relocation, compensation, availability, links, experience, languages) via structured Q&A with the user, and seed the qa[] bank with common application-form phrasings. Use before the first apply-to-jobs run, or whenever the user says "update my job application profile" / "set up my facts" / "add X to my profile".
---

# Profile interview

You are building the one source of truth `apply-to-jobs` trusts instead of
guessing. Every field you leave null here is a field that skill will have to
stop and ask about mid-application later — so it's worth getting this right
once, but it does not need to be perfect: this skill is idempotent and safe
to re-run any time a gap surfaces.

`profile.json` lives in the user's private **data repo**, not in this repo
(`lib/data-dir.mjs` finds it: `$APPLIER_DATA_DIR`, then `.data-dir`, then
`../auto-applier-data`). If there is no data repo yet, run the `setup-data-repo`
skill first — it creates one with a skeleton `profile.json` (every field `null`)
and then hands back to this interview.

## Procedure

1. **Read `profile.json`.** Note which structured fields are already filled;
   you'll skip those unless the user is explicitly correcting one.
2. **Pre-fill from the CV, don't ask from scratch.** Read the base CV in the resume
   repo (`paths.resumeRepo` in `apply-config.json`; its README says which file) and pull
   `personal.email`, `personal.phone`, `personal.currentCity`,
   `personal.currentCountry`, `links.linkedin`, `links.github` from its
   contact section. Present these to the user as "I found X — confirm or
   correct?" rather than asking blind. If `apply-config.json` does not exist
   yet, ask the user where their resume repo lives and write
   the file — that config is what keeps every absolute path out of these
   skills.
3. **Compute years of experience the same way the resume skill does** — do
   not ask the user for a number, do not hardcode one. Open the same base CV,
   find the EXPERIENCE section, and take the start year of the *earliest entry
   that is genuinely commercial software development*. Pre-career and
   adjacent-field roles do not count; the resume repo's own skills
   document where that line falls, so read them rather than deciding
   independently — the two skills disagreeing about the number is
   worse than either answer. `experience.yearsOfCommercialExperience` = current
   year minus that start year; record `experience.yearsAsOf` as today's date so
   it can be recomputed later without re-deriving the rule.
4. **Ask the remaining core facts in grouped batches**, not one field per
   message — the user answers a block, you write it, you move to the next
   block:
   - **Contact/links** — anything not already pulled from the CV; a
     portfolio URL if one exists.
   - **Work authorization** — citizenship, current residence permit
     country/type. Keep this in the structured block as *background only*;
     it never directly answers a country-specific "are you authorized to
     work in X" form question (see `workAuthorization.note` in the schema).
   - **Location & relocation** — willingness to relocate, remote/hybrid/
     onsite preference.
   - **Compensation** — default currency (base country's), expected
     min/max, and period (`year` or `month` — ask, don't assume). Then the
     three numbers `apply-to-jobs` quotes from (`compensation.strategy`):
     the **baseline** when a vacancy publishes no band, the **floor** below
     which the user must be asked before applying at all, and the **premium**
     figure for Staff / Lead / Principal or fully US-remote roles.
   - **Availability** — notice period, earliest start date, employment
     types open to.
   - **Languages** — level per language (native / fluent / professional /
     conversational / basic — ask the user's own words, don't invent a
     framework).
5. **Write structured answers directly into `profile.json`** with Edit —
   this is low-volume, one-time data, safe to hand-edit (unlike `qa[]`,
   which is machine-managed — never hand-edit that array).
6. **Seed `qa[]` with the most common ATS phrasings**, scoped to the user's
   current base country (from step 2/4), via
   `node .claude/skills/apply-to-jobs/scripts/profile-qa.mjs add ...` for
   each. This is what saves the first real `apply-to-jobs` run from
   stopping on nearly every vacancy. At minimum, seed:
   - work authorization in the base country (`work_authorization:<country>`)
   - visa sponsorship needed (`sponsorship:<country>`)
   - willingness to relocate (`relocation:<country>` or a general answer)
   - notice period
   - earliest start date
   - salary expectation in the base currency (`salary:<currency>`)
   - LinkedIn URL / GitHub URL / portfolio URL
   - "How did you hear about us?" — a generic, reusable answer
   - hybrid/onsite willingness
   - total years of professional experience (reuse the number from step 3)
   - background-check consent
   Use `profile-qa.mjs find "<question>"` first to make sure you're not
   about to add something the `add` command's own dedupe check would
   already catch — but the command refuses near-duplicates itself
   (score > 0.85), so don't over-worry about this.
7. **Seed the local job market's vocabulary** if the user applies to forms
   written in a language other than English. `apply-to-jobs` matches field
   labels against English phrasings built into
   `.claude/skills/apply-to-jobs/scripts/lib/field-labels.mjs`, plus whatever
   `apply-config.json`'s `formVocabulary` adds on top. Ask which language(s)
   the user's applications are usually in and write the field, topic and
   language-alias phrasings for those into the config. Skipping this only
   costs escalations — a label the resolver cannot read becomes a question for
   the user rather than a wrong answer — so it is worth doing but never
   urgent.
8. **Confirm the highest-stakes fields out loud before finishing** — phone,
   email, salary numbers, work authorization — read them back to the user.
   These are exactly the fields that must never be wrong on a real
   application.

## `profile.json` schema

```jsonc
{
  "$schemaVersion": 1,
  "personal": { "fullName", "firstName", "lastName", "email", "phone",
                "currentCity", "currentCountry", "citizenship" },
  "links": { "linkedin", "github", "portfolio", "other": [] },
  "workAuthorization": { "citizenship", "residencePermitCountry",
                          "residencePermitType", "note" },
  "location": { "willingToRelocate", "remotePreference", "note" },
  "compensation": { "defaultCurrency", "expectedMin", "expectedMax",
                     "period", "note", "hourlyRate", "alternates": [],
                     "derivation": { ... },
                     "strategy": { "baseline", "floor", "premium",
                                    "rounding" } },
  "availability": { "noticePeriod", "earliestStartDate",
                     "employmentTypesOpenTo": [] },
  "experience": { "yearsOfCommercialExperience", "yearsAsOf",
                   "currentTitle", "seniorityLevel", "note" },
  "languages": [{ "language", "level" }],
  "eeo": { "policy": "decline", "note" },
  "qa": []
}
```

`workAuthorization`, `location`, and `compensation` each carry a `note`
field pointing at where the country-/currency-specific answer actually
lives (`qa[]`, tagged). Leave those `note` strings as-is — they're
documentation for `apply-to-jobs`, not something to fill in per-user.

`compensation.derivation` and `compensation.strategy` hold numbers the applier
computes from, not answers to read out. When a salary changes, it changes in
two places — the anchor here, and every `qa[]` entry tagged `baseline-only`.

`eeo.policy` defaults to `"decline"` (prefer-not-to-answer on voluntary
demographic questions). Only change it if the user explicitly asks to
answer these questions differently.

## Re-running this skill

Idempotent by design — re-running only prompts for fields still `null`.
Use it any time: a new country's work-authorization question comes up
mid-application and the user wants it seeded proactively for next time,
a salary expectation changes, a notice period changes after a new job
starts, etc. When updating an existing `qa[]` entry's answer rather than
adding a new fact, edit it directly with Edit (or delete + re-add) —
`profile-qa.mjs` has no `update` command by design, since changing an
existing fact is rare enough to not need its own CLI surface.
