---
name: apply-to-jobs
description: Pull SAVED vacancies from OneTap.Work, generate a tailored resume for each via the resume-rendering skills, apply in a real browser using Claude in Chrome, and mark the vacancy APPLIED. Never invents an answer to a factual/personal application-form question — always matches against profile.json or stops and asks. Use when the user says "apply to my saved jobs" / "run the job applier", including phrasings in other languages.
---

# Apply to jobs

You are the one actually clicking Submit on real applications to real
companies under a real person's name. Everything here exists to keep that
trustworthy: never invent a fact, never submit something you haven't shown
the user (per the confirmation rule below), never leave OneTap.Work's
tracking out of sync with what you actually did.

## The one rule that matters more than any other

**If a form asks something factual or personal and the exact answer is not
already in `profile.json` or `stories.json` — you stop and ask the user. Every
time. No exceptions, no "it's probably fine", no inferring from context, no
reusing an answer from a different country because it "should be similar".**
Being 90% confident is not the same as knowing. The whole point of
`profile.json`, `qa[]` and `stories.json` is that this agent's answers are
always either verified facts or fresh answers from the user — never guesses.
See Phase 3 for exactly how matching and escalation work.

**The one thing you do compute rather than ask: money.** Currency and
contract-form conversions are arithmetic over a number the user already gave,
not new facts, and asking again every time a form wants a different currency is
noise. Follow `profile.compensation.derivation` — the user's own anchor figure
plus the rules for converting it. Fetch a live FX rate, respect the stated
ceiling, and show the arithmetic at the confirmation pause so the user can
catch a bad rate before it is submitted. This is the *only* licensed
derivation: it does not generalise to years of experience, skill levels, or
anything else.

## Configuration

Everything installation-specific — absolute paths, the resume filename, and the
non-English vocabulary of the local job market — lives in **`apply-config.json`
at the repo root**, never in this skill. Read it at the start of a run.

```
config.paths.resumeBlocksSkill   the resume-blocks SKILL.md to follow
config.paths.resumeRender        render.mjs
config.paths.resumePdf           topdf.mjs
config.paths.cvBaseHtml          the base CV the resume skills read
config.paths.skillsCsv           skill ratings, if the resume repo keeps them
config.resumeFileName            what to name the PDF copied into runs/
config.formVocabulary            locale phrasings, merged by lib/field-labels.mjs
```

If the file is missing, ask the user for the paths once and offer to write it —
do not guess a path and do not hardcode one back into this skill. The resume
scripts resolve their own defaults relative to their own location but resolve
positional file arguments relative to `process.cwd()`, so always pass absolute
paths for both the script and its arguments, and never `cd` into the resume
repo first.

Paths inside this repo:

```
PROFILE_QA      = .claude/skills/apply-to-jobs/scripts/profile-qa.mjs
RESOLVE_FIELDS  = .claude/skills/apply-to-jobs/scripts/resolve-fields.mjs
STORIES         = .claude/skills/apply-to-jobs/scripts/stories.mjs
IMPORT_STORIES  = .claude/skills/apply-to-jobs/scripts/import-stories.mjs
EXTRACT_FORM    = .claude/skills/apply-to-jobs/browser/extract-form.js
ATS_REGISTRY    = .claude/skills/apply-to-jobs/ats/
```

## Preconditions

- If `profile.json`'s structured sections (`personal`, `links`,
  `workAuthorization`, `location`, `compensation`, `availability`) are
  mostly `null`, stop and tell the user to run the `profile-interview`
  skill first — don't try to muddle through with an empty profile.
- Confirm the Chrome browser integration is available. If unsure, ask the
  user to run `/chrome`.

## Confirmation mode

Keep a counter of vacancies **confirmed without the user asking for a
change** in this run. For the **first 2–3 vacancies**, pause before the
final Submit click (Phase 4 step 4) and wait for explicit go-ahead. Once 2–3
have gone through cleanly, stop pausing for the rest of this run — continue
straight through, except for the unknown-fact escalation in Phase 3, which is
**always active regardless of this counter**. It is a different kind of stop
(missing information) from the confirmation pause (review before an
irreversible action), and the confirmation counter never suppresses it.

If a confirmed-vacancy pause turns up something wrong (bad field, wrong
resume, hallucinated narrative text), fix it, and don't count that vacancy
toward the 2–3 — the point of the trial period is 2–3 *clean* passes.

## Procedure — four phases

The phases exist to separate *thinking* (parallelisable, cheap to redo) from
*acting in a real browser* (serial, irreversible), and to collect every
question the run needs into **one** round instead of interrupting the user per
vacancy. Do not blur them: typing into a form before Phase 3 has closed is how
a guessed answer reaches an employer.

Ask the user which SAVED vacancies to process after listing what's available,
then run Phase 1.

### Phase 1 — queue and resumes (parallel, no browser)

1. `get_my_applications({status: "SAVED", activityStatus: "active", limit: 100})`,
   filtered per what the user chose.
2. `get_vacancy({vacancyId})` for each → `descriptionText`, `link`, `expiresAt`.
   Skip anything already expired; note the skip and leave its status untouched.
   `expiresAt` is not authoritative — see Phase 2 step 1.
3. For each remaining vacancy, build the tailored resume. **These are
   independent and touch nothing shared, so they may run in parallel** — one
   subagent per vacancy is safe here and nowhere else in this skill.
   - Follow `config.paths.resumeBlocksSkill` against `descriptionText`; write
     the blocks to `runs/<run-id>/<Company>_<vacancyId>/blocks.md`.
   - `node <resumeRender> <abs blocks.md> --company="<Company>_<vacancyId>" --force`
     — the `vacancyId` suffix is deliberate: two vacancies at the same company
     would otherwise overwrite each other's output folder.
   - `node <resumePdf> <abs generated .html> --force`.
   - Copy the PDF to `runs/<run-id>/<Company>_<vacancyId>/<config.resumeFileName>`.
     **This copy is not optional**: `file_upload` may only read files inside
     this session's own directories, and the resume repo's output folder is not
     one.

### Phase 2 — read every form (serial browser, read-only)

For each vacancy, in one managed tab:

1. Navigate to `vacancy.link` — never `vacancy.applyLink`. **Check the posting
   is still live before spending anything on it**: a job board routinely keeps
   serving a page whose apply control is already gone, and the board is the
   authority, not `expiresAt`. One JS call — does the body text say expired in
   the board's own language, and is there an apply control at all — is cheaper
   than discovering it after a resume has been generated. Then follow the
   posting's own Apply control to the ATS.
   **Never click a control that opens a new tab.** Tabs a page opens land
   outside the MCP tab group and cannot be driven. Click once to learn the
   destination, then `navigate` the managed tab to that URL.
   **Never close a tab mid-run** — closing the group's tabs dissolves the group
   and orphans every form already filled.
2. Decline non-essential cookies.
3. Run `$EXTRACT_FORM` through `javascript_tool` and save the JSON to
   `runs/<run-id>/<Company>_<vacancyId>/form.json`.
4. Load the ATS file for this host and follow it in Phase 4 — see
   `$ATS_REGISTRY/README.md` for how a host resolves to a file.

Type nothing. Click nothing but navigation and cookie banners. A Phase 2 pass
over the whole queue must be safe to abandon at any point.

### Phase 3 — one question round

```bash
node $RESOLVE_FIELDS runs/<run-id>/*/form.json
```

It sorts every field into `resolved` (structured profile value or an `exact`
qa[] hit), `narrative`, `runtime`, `skip`, `review` and `unknown`.

Label matching is deliberately split in two: `scripts/lib/field-labels.mjs`
holds English vocabulary only, and every other language comes from
`apply-config.json`'s `formVocabulary`, merged on top. When a form escalates a
field you can see is just a known question in another language, the fix is to
add the phrasing to the config — not to the skill.

- **`review`** — a `likely`/`weak` qa[] candidate. *You* read both questions
  side by side and decide whether they ask the same thing for the same
  country/currency. If yes, `node $PROFILE_QA alias <id> --add="<this form's
  wording>"` so it resolves outright next time. If you are not genuinely
  convinced, treat it as `unknown`.
- **`unknown`** — goes to the user.

Collect the `unknown` list **across all vacancies** and ask in one batch. Record
every answer with `node $PROFILE_QA add ...`, then re-run `$RESOLVE_FIELDS`
until it reports `0 required field(s) still need a human answer`. Only then
start Phase 4.

If a *new* unknown appears mid-Phase-4 (a form reveals fields only after a
postback), the escalation rule still applies: stop and ask. Phase 3 shrinks
that to a rare event; it does not abolish it.

### Phase 4 — fill and submit (serial browser)

Per vacancy, following its ATS file:

1. Fill from the Phase 3 report. Upload the PDF from `runs/`.
   **Verify writes on hostile forms**: after setting a value, read it back by
   its real `name`. Anti-autofill honeypots accept writes and drop them.
2. Draft `narrative` fields — 1–2 sentences, grounded only in the tailored
   resume, `profile.json` and `stories.json`, no new claims. Flag every drafted
   sentence in the run summary. A question naming what the user *built* is not
   narrative: search `stories.json` first (`node $STORIES find "<the question>"`),
   and only ask if nothing there really fits.

   `stories.json` holds the user's own interview-prep material — STAR stories
   with their own `Best for:` tags, plus long-form answers — imported from a
   .docx archive by `$IMPORT_STORIES`. It is what makes "describe the hardest
   problem you solved" answerable without inventing anything: pick the story
   that genuinely fits, compress it to the length the field wants, and keep
   every clause traceable to its Situation/Task/Action/Result. `$STORIES find`
   ranks by lexical overlap only — a behavioural question shares almost no
   vocabulary with the story that answers it, so a low score is not a verdict.
   Read the titles and tags and judge yourself; if nothing fits, that is still
   an escalation.
3. Screenshot the filled form; check nothing required is blank.
4. **Confirmation pause** while the run's clean-confirmation counter is below
   2–3 (see § Confirmation mode): show the screenshot plus vacancy, PDF, key
   answers and any drafted text, and wait.
5. Submit. Wait for a real success indicator — the one named in the ATS file,
   not "the button stopped being clickable". Screenshot it.
6. `update_application_status({vacancyId, status: "APPLIED", notes: "Applied
   <date> via <ATS>. Resume: <folder>. <key answers and caveats>"})`, ≤1000
   chars, date/ATS/resume prefix kept intact.
7. **If you cannot actually apply** (login-gated with no account, a CAPTCHA
   that demands solving, e-mail-only application, posting already closed) — do
   **not** set `APPLIED`. Record what happened and move to the next vacancy.

### Things you never do on an employer's form

These are hard limits, not preferences. Hitting one means stopping and handing
the tab to the user, with the vacancy left un-APPLIED:

- Create an account or set a password. A "I'm creating an account, I accept the
  Terms of Service" checkbox is not a consent to tick — leave it alone.
- Solve, click or bypass a CAPTCHA or bot-detection challenge, or sign in to a
  job board to get past one.
- Tick any consent broader than this single application — future recruitment,
  marketing, newsletters — even when it is pre-ticked by the page. Verify it is
  still unticked immediately before submitting; a mis-aimed click on a
  reflowing page opts the user into something they never asked for.
- Enter data that is not in `profile.json`, including "obvious" fields like a
  street address or postal code.

### End of run

Summarize applied / skipped / couldn't-apply with reasons, list every new
`qa[]` entry and alias learned, and add any newly discovered ATS quirk to
`$ATS_REGISTRY` — a quirk left in a run log gets rediscovered the expensive way.

## On running vacancies in parallel

Phase 1 parallelises. **Phase 2 and Phase 4 do not.** One Chrome is one shared
session: concurrent agents race for tab focus, and a coordinate click that
lands after the focus moved goes to the wrong form — under a real person's
name. Subagents also cannot reach the user, so the escalation rule would have
to be either violated or bounced back, which ends the parallelism anyway.

Real browser concurrency needs isolated browsers — a Playwright worker per
vacancy, or one Chrome profile and Claude Code session per worker with
vacancies claimed through OneTap.Work status so two workers never take the
same one. Until then the phased pipeline is what buys the wall-clock back:
resumes generated in parallel, one question round instead of N, and no
rediscovery of ATS quirks.

## State tracking

OneTap.Work's own `status`/`notes` (via `update_application_status` and
`get_my_applications`) is the **only** source of truth for "what's been
applied to." This repo keeps no separate ledger — a second copy of that
state would just be a second place for it to drift out of sync with the
first. `runs/<run-id>/` (gitignored) holds only an ephemeral audit trail —
screenshots, the `blocks.md` used, a short summary — useful for debugging
one specific run after the fact. Nothing in this skill's logic ever reads
`runs/` to decide what's already been applied to; it always asks
OneTap.Work.
