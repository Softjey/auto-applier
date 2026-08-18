# auto-applier

Automated applications to saved (SAVED) vacancies from OneTap.Work: tailors
a resume for each vacancy, applies in a real browser via the Claude Code +
Chrome integration, and never invents an answer to an application-form
question — only facts from `profile.json`, or it asks the user directly.

## ⚠️ PRIVACY — NEVER push this repository to a public remote

`profile.json` contains personal data: phone, email, salary expectations,
work authorization/visa status, date of birth (if ever added), etc.
`stories.json` is worse: it is the user's unpublished account of internal
work at named employers — incidents, security vulnerabilities, systems and
colleagues. Both are deliberately not gitignored — version history is needed
to see how the data grew and to revert a bad edit. But the files themselves
are private. If a remote is ever needed — private only.

## Related repositories

- `~/Desktop/projects/personal/my-career-profile` — resume and
  skills (`skills.csv`, `CV_Base.html`) and three Claude Code skills for
  tailoring a resume to a vacancy: `resume-blocks` → `resume-render` →
  `resume-pdf`. This repo (`auto-applier`) always calls their scripts with
  **absolute paths** — `render.mjs`/`topdf.mjs` resolve their own defaults
  relative to the script's own location, but resolve positional arguments
  relative to `process.cwd()`, so `cd`-ing into that repo before calling
  them is unnecessary and unsafe.
- OneTap.Work MCP — the source of SAVED vacancies, and where the final
  status is written (`update_application_status`). It's the single source
  of truth for what's already been applied to — `auto-applier` keeps no
  separate application ledger. `vacancy.link` is the only field used for
  browser navigation; `vacancy.applyLink` is an internal server field,
  never used directly.

## Structure

- `profile.json` — the user's structured facts plus a growable `qa[]` bank
  of application-form answers (tagged by country, since the same wording can
  have a different correct answer depending on the vacancy). Money is the one
  thing not stored per-currency: `compensation.derivation` holds a single
  anchor plus the rules to compute any other currency or contract form from
  it, so a new currency is calculated, not escalated.
- `stories.json` — the user's own interview-prep material (STAR stories and
  long-form answers) imported from the Recruting `.docx` archive. This is what
  free-text "describe a time when…" fields are grounded in, so that a narrative
  answer is a real event from the user's career rather than something written
  to sound good. Regenerate with `scripts/import-stories.mjs`, search with
  `scripts/stories.mjs`. Personal data — same no-public-remote rule as
  `profile.json`.
- `.claude/skills/profile-interview/` — fills/updates `profile.json` via a
  structured interview with the user. Run before the first real
  apply-to-jobs run.
- `.claude/skills/apply-to-jobs/` — the main orchestrator, run in four
  phases: resumes (parallel) → read every form (serial, read-only) → one
  batched question round → fill and submit (serial).
  - `scripts/lib/qa-match.mjs` — the one matcher both scripts share, so a
    question never scores differently depending on who asked.
  - `scripts/profile-qa.mjs` — deterministic fuzzy-match and atomic-write
    index over `qa[]` (the semantic judgment of "is this really the same
    question" stays with Claude — the script only ranks candidates).
  - `browser/extract-form.js` — read-only field-schema dump, pasted into
    `javascript_tool` during phase 2. Flags anti-autofill honeypots.
  - `scripts/resolve-fields.mjs` — sorts a form's fields into resolved /
    narrative / review / unknown against `profile.json`. It never guesses:
    only a structured value or an `exact` qa[] hit counts as resolved.
  - `ats/<host>.md` — quirks paid for by a failed submit. Add to it in the
    same commit as the fix.
- `runs/` (gitignored) — an ephemeral audit trail (screenshots, blocks.md,
  summary) for one run. Never used to decide "what's already been applied
  to" — that's OneTap.Work's job.

## The system's core rule

The agent filling out an application form **never invents a fact**. If the
exact answer isn't in `profile.json` (neither in the structured fields nor
in `qa[]` with enough confidence) — stop, ask the user, record the answer
via `profile-qa.mjs add`, and only then continue. Details in
`.claude/skills/apply-to-jobs/SKILL.md`.
