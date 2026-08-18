---
name: apply-to-jobs
description: Pull SAVED vacancies from OneTap.Work, generate a tailored resume for each via the my-career-profile skills, apply in a real browser using Claude in Chrome, and mark the vacancy APPLIED. Never invents an answer to a factual/personal application-form question — always matches against profile.json or stops and asks. Use when the user says "apply to my saved jobs" / "run the job applier", including phrasings in other languages.
---

# Apply to jobs

You are the one actually clicking Submit on real applications to real
companies under the user's real name. Everything here exists to keep that
trustworthy: never invent a fact, never submit something you haven't shown
the user (per the confirmation rule below), never leave OneTap.Work's
tracking out of sync with what you actually did.

## The one rule that matters more than any other

**If a form asks something factual or personal and the exact answer is not
already in `profile.json` — you stop and ask the user. Every time. No
exceptions, no "it's probably fine", no rounding, no inferring from context,
no reusing an answer from a different country/currency because it "should
be similar".** Being 90% confident is not the same as knowing. The whole
point of `profile.json` and `qa[]` is that this agent's answers are always
either verified facts or fresh answers from the user — never guesses. See
§ Filling the form for exactly how matching and escalation work.

## Constants

Absolute paths — this skill always invokes the sibling repo's scripts with
absolute paths for both the script and any file arguments, never `cd` into
it first. (`render.mjs`/`topdf.mjs` resolve their own defaults — skills.csv,
CV_Base.html, out/ — relative to the script's own location, but resolve
positional file arguments relative to `process.cwd()`. Mixing those up
silently reads or writes the wrong file.)

```
SIBLING_REPO         = ~/Desktop/projects/personal/my-career-profile
RESUME_BLOCKS_SKILL  = $SIBLING_REPO/.claude/skills/resume-blocks/SKILL.md
RESUME_RENDER        = $SIBLING_REPO/.claude/skills/resume-render/render.mjs
RESUME_PDF           = $SIBLING_REPO/.claude/skills/resume-pdf/topdf.mjs
PROFILE_QA           = <this repo>/.claude/skills/apply-to-jobs/scripts/profile-qa.mjs
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
final Submit click (Step 6 below) and wait for explicit go-ahead. Once 2–3
have gone through cleanly, stop pausing for the rest of this run — continue
straight through, except for the unknown-fact escalation in § Filling the
form, which is **always active regardless of this counter**. It is a
different kind of stop (missing information) from the confirmation pause
(review before an irreversible action), and the confirmation counter never
suppresses it.

If a confirmed-vacancy pause turns up something wrong (bad field, wrong
resume, hallucinated narrative text), fix it, and don't count that vacancy
toward the 2–3 — the point of the trial period is 2–3 *clean* passes.

## Procedure

Ask the user which SAVED vacancies to process this run (all of them, a
number, or specific ones) after listing what's available — this doubles as
the natural place to do a small dry run first.

1. `get_my_applications({status: "SAVED", limit: 100})` to get the queue,
   filtered/limited per what the user chose.
2. For each selected vacancy, **sequentially, one full browser flow at a
   time** (never parallel — the browser is a single shared session):

   1. `get_vacancy({vacancyId})` → `descriptionText`, `link`, `salary`,
      `expiresAt`. If `expiresAt` has already passed, skip it — don't spend
      a browser flow on a dead posting. Note the skip in the run summary
      and leave the OneTap.Work status untouched (it wasn't attempted, so
      it isn't a failure).

   2. **Tailor the resume**, all paths absolute:
      - Read `$RESUME_BLOCKS_SKILL` and follow its procedure against this
        vacancy's `descriptionText`. Write the resulting blocks to
        `<this repo>/runs/<run-id>/<Company>_<vacancyId>/blocks.md`.
      - `node $RESUME_RENDER <abs path to blocks.md> --company="<Company>_<vacancyId>" --force`
        — the `vacancyId` suffix on `--company` is deliberate, not a typo:
        two different vacancies sharing a company name (or a repost) would
        otherwise silently overwrite each other's `out/` folder in the
        sibling repo before either got applied to. Renders to
        `$SIBLING_REPO/out/<Company>_<vacancyId>/!Jane_Doe_CV.html`.
      - `node $RESUME_PDF <abs path to the generated .html> --force` →
        sibling `.pdf` in the same folder.
      - Keep the resulting absolute `.pdf` path — you'll upload it in
        Step 4.

   3. **Navigate the browser to `vacancy.link` — never `vacancy.applyLink`.**
      `applyLink` is an internal field the OneTap.Work server explicitly
      says never to use directly; always land on the public posting and
      find the real Apply button/flow from there, the way a human would.
      Follow it through to whatever ATS it lands on (Greenhouse, Lever,
      Workable, Teamtailor, a native company form — all different, all
      fine, this skill doesn't special-case any of them).

   4. **Fill the form, field by field.** Classify each field before
      touching it:

      | field type | source |
      | --- | --- |
      | File upload (resume/CV) | the PDF generated in step 2 |
      | Structural fact (name, email, phone, LinkedIn, GitHub) | `profile.json`'s structured sections, directly |
      | Country-/currency-dependent fact (work authorization, relocation, salary in local currency, sponsorship) | `profile-qa.mjs find` — see matching rules below |
      | Voluntary EEO/demographic field | `profile.eeo.policy` (default: decline/prefer-not-to-answer option) — no need to ask each time |
      | Open-ended narrative ("why this company", short cover letter blurb) | Claude may draft one, grounded *only* in facts already present in the tailored resume or `profile.json` — never a new unverifiable claim. Always flag drafted text in the run summary for the user to see, regardless of confirmation mode. |

      **Matching a form question against `qa[]`:**
      ```
      node $PROFILE_QA find "<the exact question text from the form>"
      ```
      - `exact` (score > 0.8) or `likely` (0.5–0.8) **and** you, reading
        both questions side by side, are genuinely convinced they ask the
        same thing for the same country/currency → reuse the answer, then
        `node $PROFILE_QA touch <id>`.
      - Anything else (`weak`, `none`, or a `likely` you're not actually
        convinced by) → **stop. Show the user the exact question text.
        Get the real answer. Record it:**
        ```
        node $PROFILE_QA add --question="<verbatim question>" --answer="<user's answer>" \
             --tags=<relevant tags> --canonical=<topic>:<country-or-currency-if-relevant> \
             [--aliases="<other phrasing you've already seen for this>"]
        ```
        Then continue. This is the mechanism that makes the "never
        fabricate" rule actually hold over time instead of just being a
        good intention — every real gap becomes a permanent, reusable fact.

   5. Screenshot the filled form. Check nothing required is blank or still
      showing placeholder text.

   6. **Confirmation pause** — only while the run's clean-confirmation
      counter (see § Confirmation mode) is below 2–3: show the user the
      screenshot plus a short summary (vacancy, which resume/PDF, the key
      answers used, any drafted narrative text) and wait for their
      go-ahead before clicking Submit. Once past the trial threshold, skip
      straight to Step 7.

   7. Click Submit. Wait for a real success indicator (confirmation page,
      "application received" message, etc. — not just "the button stopped
      being clickable"). Screenshot the result.

   8. `update_application_status({vacancyId, status: "APPLIED", notes: "Applied <date> via <ATS>. Resume: <folder name>. <any caveats>"})`.
      Keep `notes` at or under 1000 characters — truncate defensively if a
      caveat list runs long, keeping the date/ATS/resume-folder prefix
      intact since that's the part worth finding later.

   9. **If you cannot actually apply** (login-gated with no account,
      CAPTCHA you can't solve, application is email-only, the posting
      turns out to already be closed despite `expiresAt`) — do **not** set
      `APPLIED`. Leave the OneTap.Work status as-is, record what happened
      in the run summary, and move on to the next vacancy. One
      unreachable posting should never abort the whole run.

3. **End of run**: summarize — applied / skipped (expired) / couldn't apply
   (with reasons) — and list every new `qa[]` entry learned this run so the
   user can see exactly what the system now knows that it didn't before.

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
