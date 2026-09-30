# auto-applier

Automated applications to saved (SAVED) vacancies from OneTap.Work: tailors a
resume for each vacancy, applies in a real browser, and never invents an answer
to an application-form question — only facts from `profile.json`, or it asks the
user directly.

It runs under Claude Code and under Codex; see § Running under either agent.

## Two repositories: code (here) and data (private)

**This repo contains no personal data and can be public.** Everything about one
person lives in a separate, private **data repo** (default: `../auto-applier-data`):

| In the data repo | What it is |
| --- | --- |
| `profile.json` | the user's structured facts + the `qa[]` bank of form answers |
| `apply-config.json` | paths to their resume repo, resume file name, `formVocabulary` for non-English forms |
| `stories.json` | STAR stories / long answers that free-text fields are grounded in |
| `credentials.json` | which employer portals have an account for them (private; real logins) |
| `triage/<date>.md` | one readable report per triage of the SAVED queue |
| `runs/<date>-<slug>/` | audit trail of each apply run — per vacancy `answers.md`, `salary.json`, the CV sent, screen recordings; plus `summary.md` |

Recommended layout: one workspace folder holding both repos side by side
(`<workspace>/auto-applier/`, `<workspace>/auto-applier-data/`), with Claude Code
opened in the workspace — sessions and memory then belong to the workspace, and the
default `../auto-applier-data` just works. Scripts find the data repo through `scripts/lib/data-dir.mjs`: `$APPLIER_DATA_DIR`,
then the path in `<repo>/.data-dir`, then `../auto-applier-data`. **No data repo
yet → run the `setup-data-repo` skill** (it scaffolds one from `templates/data-repo/`
and hands over to `profile-interview`). Bare paths like `profile.json` or
`runs/…` in the skills are relative to the data repo.

Rules that follow from the split:

- **Never put personal data in this repo** — not in code, skills, ATS notes, tests
  or fixtures. Tests use the fake person in `autofill/fixtures/`. ATS notes use
  placeholders (`123456789`, `<config.resumeFileName>`). The root `.gitignore`
  blocks the data files so they cannot be committed here by accident.
- **Never add a public remote to the data repo.** It holds a phone number, salary
  expectations, work-authorization status, every answer given to an employer and
  recordings of filled-in forms. Private remotes only.
- Triage output is Markdown only, in the data repo's `triage/`, never in `runs/`.

## Related repositories

- **Resume repo** (user's own; location in `apply-config.json` → `paths`) — base
  CV, `skills.csv`, and three skills for tailoring a resume to a vacancy:
  `resume-blocks` → `resume-render` → `resume-pdf`. This repo always calls their
  scripts with **absolute paths** — `render.mjs`/`topdf.mjs` resolve positional
  arguments relative to `process.cwd()`, so `cd`-ing into that repo first is
  unnecessary and unsafe.
- **OneTap.Work MCP** — the source of SAVED vacancies, and where the final status
  is written (`update_application_status`). It is the single source of truth for
  what has been applied to — this system keeps no separate application ledger.
  `vacancy.link` is the only field used for browser navigation; `vacancy.applyLink`
  is an internal server field, never used directly.

## Running under either agent

The skills and the scripts have one home — `.claude/`. The rest is wiring so a
second agent reads the same files instead of a fork of them.

- `AGENTS.md` → symlink to `CLAUDE.md`. Codex reads `AGENTS.md`, Claude Code reads
  `CLAUDE.md`; this file is both, so keep it free of agent-specific instructions.
- `.agents/skills/<name>` → symlinks into `.claude/skills/<name>`. Codex discovers
  project skills from `.agents/skills/` and `.codex/skills/` only and never looks
  in `.claude/`. Symlinks are followed, and Node resolves them before computing a
  script's repo root, so the scripts work through either path. Add a new skill in
  `.claude/skills/`, then symlink it here in the same commit.
- `.codex/config.toml` — Codex-only settings, merged on top of `~/.codex/config.toml`
  **and only for a repository marked trusted**. It declares the OneTap.Work MCP
  server, which Claude Code gets from the user's own connector settings instead.
  Per machine, once: `codex mcp login onetap`.
- `.claude/skills/apply-to-jobs/browser/README.md` — the five browser capabilities
  the apply run needs, and what each agent calls them. Claude in Chrome and Codex's
  bundled `browser` plugin differ in tool names and quirks, so `SKILL.md` names
  capabilities and that file names tools. An agent-specific browser detail belongs
  there, never in the phases.

## Structure

- `.claude/skills/setup-data-repo/` — creates the user's private data repo from
  `templates/data-repo/` (`scripts/init-data-repo.mjs`) and points this repo at it.
- `.claude/skills/profile-interview/` — fills/updates `profile.json` via a structured
  interview. Run before the first real apply run.
- `.claude/skills/apply-method-triage/` — read-only survey of the SAVED queue, sorted
  into four groups by **the method each application demands**: Easy Apply inside the
  board, an external ATS an autofill extension can prefill, an external form typed
  by hand, and expired postings (archived). Groups are mutually exclusive and Easy
  Apply wins any overlap. Support data lives in its `reference/`, extracted from the
  extension itself, not from the `ats/*.md` notes. Writes `triage/<date>.md`.
- `.claude/skills/apply-to-jobs/` — the main orchestrator, in four phases: resumes
  (parallel) → read every form (serial, read-only) → one batched question round →
  fill and submit (serial). Where the user's Chrome shows the Simplify Copilot panel
  on a form, phases 2–4 collapse into one pass (`SKILL.md` § Simplify fast path).
  - `scripts/lib/data-dir.mjs` — where the data repo is; every script goes through it.
  - `scripts/lib/qa-match.mjs` — the one matcher every script shares.
  - `scripts/lib/field-labels.mjs` — English form vocabulary, plus the merge of
    `apply-config.json`'s locale packs on top of it.
  - `scripts/profile-qa.mjs` — fuzzy match and atomic write over `qa[]` (the semantic
    judgment of "is this really the same question" stays with the agent).
  - `scripts/resolve-fields.mjs` — sorts a form's fields into resolved / narrative /
    review / unknown against `profile.json`. Never guesses: only a structured value
    or an `exact` qa[] hit counts as resolved.
  - `scripts/salary-quote.mjs` — the figure for one vacancy's salary field, computed
    from its published band per `compensation.strategy`. Exit code 3 = under the
    floor, ask the user before applying at all. Whatever it returns is recorded in
    the OneTap.Work application note, every time.
  - `scripts/stories.mjs`, `import-stories.mjs` — search / import `stories.json`.
  - `scripts/credentials.mjs` — the portal-account registry. The agent never creates
    an account or invents a password: it fills the sign-up form up to the password,
    stops, and the user sets their own and clicks Create Account.
  - `browser/extract-form.js` — read-only field-schema dump run in the page during
    phase 2. Flags anti-autofill honeypots.
  - `ats/<host>.md` — quirks paid for by a failed submit, keyed by exact host then by
    registrable domain. Add to it in the same commit as the fix. English, identified
    by DOM handle rather than on-screen labels, and free of one person's answers.
- `autofill/` — a browser extension plus a loopback plan server that fills the forms
  Simplify does not cover (Traffit, eRecruiter, justjoin.it) from `profile.json`.
  TypeScript pnpm workspace; the server imports `resolve-fields.mjs` so the extension
  and the agent resolve a question the same way. Fills facts only, never submits.
  Meant to be published — see `autofill/README.md`.
- `templates/data-repo/` — what `setup-data-repo` copies into a new data repo.

## The system's core rule

The agent filling out an application form **never invents a fact**. If the exact
answer isn't in `profile.json` (neither in the structured fields nor in `qa[]` with
enough confidence) — stop, ask the user, record the answer via `profile-qa.mjs add`,
and only then continue. Details in `.claude/skills/apply-to-jobs/SKILL.md`.
