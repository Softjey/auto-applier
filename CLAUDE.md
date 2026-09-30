# auto-applier

Automated applications to saved (SAVED) vacancies from OneTap.Work: tailors
a resume for each vacancy, applies in a real browser, and never invents an
answer to an application-form question — only facts from `profile.json`, or it
asks the user directly.

It runs under Claude Code and under Codex; see § Running under either agent.

## ⚠️ PRIVACY — NEVER push this repository to a public remote

`profile.json` contains personal data: phone, email, salary expectations,
work authorization/visa status, date of birth (if ever added), etc.
`stories.json` is worse: it is the user's unpublished account of internal
work at named employers — incidents, security vulnerabilities, systems and
colleagues. `runs/` now joins them: every tailored CV, every answer sheet with
the salary asked of each employer, and screen recordings of filled-in forms.
`credentials.json` is the sharpest of the four: real passwords for real employer-portal
accounts, in plaintext. It is tracked on purpose — the user asked for the record — which
makes the no-public-remote rule non-negotiable rather than merely advisable.
None of these are gitignored — version history is needed to see how the data
grew and to revert a bad edit. But the files themselves are private. If a
remote is ever needed — private only.

## Related repositories

- `<resume-repo>` — resume and
  skills (`skills.csv`, `CV_Base.html`) and three Claude Code skills for
  tailoring a resume to a vacancy: `resume-blocks` → `resume-render` →
  `resume-pdf`. This repo (`auto-applier`) always calls their scripts with
  **absolute paths** — `render.mjs`/`topdf.mjs` resolve their own defaults
  relative to the script's own location, but resolve positional arguments
  relative to `process.cwd()`, so `cd`-ing into that repo before calling
  them is unnecessary and unsafe. Those paths are not written into the
  skills; they come from `apply-config.json` (below).
- OneTap.Work MCP — the source of SAVED vacancies, and where the final
  status is written (`update_application_status`). It's the single source
  of truth for what's already been applied to — `auto-applier` keeps no
  separate application ledger. `vacancy.link` is the only field used for
  browser navigation; `vacancy.applyLink` is an internal server field,
  never used directly.

## Running under either agent

The skills, the data and the scripts have one home — `.claude/`, `profile.json`,
`stories.json`, `apply-config.json`. The rest is wiring so a second agent reads
the same files instead of a fork of them.

- `AGENTS.md` → symlink to `CLAUDE.md`. Codex reads `AGENTS.md`, Claude Code
  reads `CLAUDE.md`; this file is both, so keep it free of agent-specific
  instructions.
- `.agents/skills/<name>` → symlinks into `.claude/skills/<name>`. Codex
  discovers project skills from `.agents/skills/` and `.codex/skills/` only —
  it never looks in `.claude/`, and `[[skills.config]]` in a config file can
  merely enable or disable a skill that was already discovered, not add a
  search path. Symlinks are followed, and Node resolves them before computing a
  script's repo root, so the scripts work through either path. Add a new skill
  in `.claude/skills/`, then symlink it here in the same commit.
- `.codex/config.toml` — Codex-only settings, merged on top of
  `~/.codex/config.toml` **and only for a repository marked trusted**. It
  declares the OneTap.Work MCP server, which Claude Code gets from the user's
  own connector settings instead. Per machine, once: `codex mcp login onetap`.
- `.claude/skills/apply-to-jobs/browser/README.md` — the five browser
  capabilities the apply run needs, and what each agent calls them. Claude in
  Chrome and Codex's bundled `browser` plugin differ in tool names and in which
  quirks bite (tab groups, upload directories), so `SKILL.md` names capabilities
  and that file names tools. An agent-specific browser detail belongs there,
  never in the phases.

## Structure

- `apply-config.json` — the seam between this installation and the generic
  skills. Everything under `.claude/` is deliberately English-only and
  carries no absolute paths and no personal data; this file supplies both.
  It holds the paths into `my-career-profile`, the resume filename, and
  `formVocabulary` — how the fields of a non-English application form are
  worded, merged on top of the skills' built-in English vocabulary. Delete
  it and the skills still run, in English, asking for what they need. Teach
  the system a new language here, never in `.claude/`.
- `profile.json` — the user's structured facts plus a growable `qa[]` bank
  of application-form answers (tagged by country, since the same wording can
  have a different correct answer depending on the vacancy). Money is the one
  thing not stored per-currency: `compensation.derivation` holds a single
  anchor plus the rules to compute any other currency or contract form from
  it, so a new currency is calculated, not escalated. Which figure goes on a
  given form is decided per vacancy by `compensation.strategy` +
  `salary-quote.mjs`, not by the anchor — the qa[] salary entries are only
  the no-band baseline.
- `credentials.json` — employer-portal accounts, keyed by registrable domain. Some ATSes
  (Workday, Avature) refuse an application without a candidate account; the agent neither
  creates the account nor invents a password for it — it fills the sign-up form up to the
  password, stops, and the user picks their own password and clicks Create Account, after
  which the agent finishes the application. The file is the record of which portals have
  an account, keyed by domain so a second vacancy at the same employer reuses it instead
  of minting a second one; the agent no longer writes passwords into it.
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
- `.claude/skills/apply-method-triage/` — read-only survey of the SAVED
  queue, sorting it into four groups by **the method each application
  demands**: Easy Apply inside the board, an external ATS an autofill
  extension can prefill, an external form typed by hand, and expired
  postings (archived).
  The groups are mutually exclusive and Easy Apply wins any overlap — where the
  form lives decides how the run is driven; an extension is only an aid on top.
  Support data lives in its `reference/`, extracted from the extension itself,
  not from the `ats/*.md` notes. Run it before an apply run to plan one.
- `.claude/skills/apply-to-jobs/` — the main orchestrator, run in four
  phases: resumes (parallel) → read every form (serial, read-only) → one
  batched question round → fill and submit (serial). Where the user's Chrome
  shows the Simplify Copilot panel on a form, phases 2–4 collapse into one pass:
  Simplify autofills, the agent verifies every value against `profile.json`,
  fills the gaps and submits (`SKILL.md` § Simplify fast path).
  - `scripts/lib/qa-match.mjs` — the one matcher every script shares, so a
    question never scores differently depending on who asked.
  - `scripts/lib/field-labels.mjs` — English form vocabulary, plus the merge
    of `apply-config.json`'s locale packs on top of it.
  - `scripts/profile-qa.mjs` — deterministic fuzzy-match and atomic-write
    index over `qa[]` (the semantic judgment of "is this really the same
    question" stays with Claude — the script only ranks candidates).
  - `browser/README.md` — the browser capabilities phase 2 and 4 need, and
    the tool names each agent gives them.
  - `browser/extract-form.js` — read-only field-schema dump, run in the page
    during phase 2. Flags anti-autofill honeypots.
  - `scripts/resolve-fields.mjs` — sorts a form's fields into resolved /
    narrative / review / unknown against `profile.json`. It never guesses:
    only a structured value or an `exact` qa[] hit counts as resolved.
  - `scripts/salary-quote.mjs` — the figure for one vacancy's salary field,
    computed from its published band per `compensation.strategy`, in whatever
    currency / period / contract form the form asks for. Salary fields are
    routed to it (`runtime`) instead of to qa[], so a stored baseline can
    never be submitted to an employer who published a different band. Exit
    code 3 = under the floor, ask the user before applying at all. Whatever
    it returns is recorded in the OneTap.Work application note, every time —
    once the form is submitted that note is the only record of the number.
  - `ats/<host>.md` — quirks paid for by a failed submit, keyed by exact host
    then by registrable domain (`recruitee.com.md` covers every tenant). Add
    to it in the same commit as the fix. Written in English and identified by
    DOM handle rather than by on-screen labels, since the same ATS renders in
    whatever language the employer hires in.
- `autofill/` — a browser extension plus a loopback plan server that fills the
  forms Simplify does not cover (Traffit, eRecruiter, justjoin.it)
  from `profile.json`. TypeScript pnpm workspace; the server imports
  `resolve-fields.mjs` so the extension and the agent resolve a question the same
  way. It fills facts only and never submits. See `autofill/README.md`.
- `runs/` — the audit trail of every apply run, **tracked in git since
  2026-09-06** (it used to be gitignored and treated as disposable). One folder
  per vacancy holding `answers.md` (every question the form asked and every
  answer given), `blocks.md`, `salary.json`, the tailored CV, and the
  `filled-form.gif` / `submitted.gif` recordings, plus a `summary.md` per run.
  It is version-controlled for the same reason `profile.json` is: to be able to
  see afterwards exactly what an employer was told, and when.
  It is still **never** used to decide "what's already been applied to" — that
  is OneTap.Work's job, and a second copy of that state would only drift.

## The system's core rule

The agent filling out an application form **never invents a fact**. If the
exact answer isn't in `profile.json` (neither in the structured fields nor
in `qa[]` with enough confidence) — stop, ask the user, record the answer
via `profile-qa.mjs add`, and only then continue. Details in
`.claude/skills/apply-to-jobs/SKILL.md`.
