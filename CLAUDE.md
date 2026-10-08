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
| `stories.json` | STAR stories (tagged `themes` / `stack`) and about-me texts that free-text fields are grounded in |
| `credentials.json` | the user's employer-portal logins, kept by the extension's password manager (private; real passwords) |
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

- **Resume repo** (user's own; location in `apply-config.json` → `paths.resumeRepo`)
  — the base CV and the skills that tailor a resume to a vacancy. How it stores and
  builds resumes is documented there, not here: read its `README.md` and
  `.claude/skills/`, and never copy that knowledge into this repo.
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
- `.claude/skills/import-stories/` — builds/updates `stories.json` from whatever the
  user hands over (docs, notes, CV, chat, or an interview). Instructions only, no
  script: the agent sorts, drops what does not belong (company-specific answers,
  salary, scripts), asks about gaps, writes the JSON and runs `stories.mjs validate`.
- `.claude/skills/apply-method-triage/` — read-only survey of the SAVED queue, sorted
  into five groups by **the method each application demands**: a form the repo's own
  `autofill/` extension fills (its adapters are read fresh each run, so a new adapter
  moves vacancies with no edit to the skill — today Traffit, eRecruiter, justjoin.it),
  Easy Apply inside the board, an external ATS Simplify can prefill, an external form
  typed by hand, and expired postings (archived). Groups are mutually exclusive, first
  match wins in that order. Simplify's support data lives in its `reference/`,
  extracted from the extension itself, not from the `ats/*.md` notes. Writes
  `triage/<date>.md`.
- `.claude/skills/apply-to-jobs/` — the main orchestrator, in four phases: resumes
  (parallel) → read every form (serial, read-only) → resolve, park what needs the user →
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
    Order matters: an `exact` qa[] hit beats the loose structural vocabulary (single
    words like "country" or "mobile"), so a recorded answer is never shadowed. Every
    qa[] entry has a unique `canonicalTopic` and a `kind` (fact / policy / narrative /
    employer-specific); `profile-qa.mjs add` requires both, and refuses a narrative over
    450 chars (that is a story → `stories.json`). `remove <id>` deletes an entry. Salary
    is never in qa[].
    An entry has two voices: `answer` is read by the agent (the fact with its how-and-when),
    `value` is the exact text a form box receives (`null` = a rule, never typed) and `pick`
    names the option to look for in a list when that differs. The resolver gives a box the
    `value` and a list the `pick` or `answer`; an entry with no `value` is legacy and its
    `answer` runs through `typeableAnswer`, which hands instructions back as `review`.
    `set-value` and `migrate-values` maintain it; see `apply-to-jobs/SKILL.md` § The qa[]
    answer format.
  - `scripts/salary-quote.mjs` — the figure for one vacancy's salary field, computed
    from its published band per `compensation.strategy`. Exit code 3 = under the
    floor, ask the user before applying at all. Whatever it returns is recorded in
    the OneTap.Work application note, every time.
  - `scripts/stories.mjs` — `find` (question → fixed theme list → stories), `show`,
    `list`, `themes`, `coverage`, `validate` over `stories.json`; the theme vocabulary
    and its question keywords (English plus extra languages, diacritic-blind) are in
    `scripts/lib/story-themes.mjs`; `scripts/test-story-themes.mjs` is its regression
    test (run it after touching the keys). There is no importer.
  - `scripts/credentials.mjs`, `scripts/lib/credentials-store.mjs` — the portal-account
    store (`credentials.json`, schema 2), shared with the autofill extension's password
    manager. The extension fills sign-ins and creates accounts (generated, never-reused
    password, saved before the submit); the agent presses the portal's own buttons and
    never reads or types a password. `credentials.mjs status` answers "is there an
    account?" without a secret.
  - `scripts/check-server.mjs` — is the autofill plan server up (any HTTP answer = up; it only
    talks to the extension)? Down means no CV list and no "Save password?"; the apply run
    checks it before the first browser step.
  - `browser/extract-form.js` — read-only field-schema dump run in the page during
    phase 2. Flags anti-autofill honeypots.
  - `ats/<host>.md` — quirks paid for by a failed submit, keyed by exact host then by
    registrable domain. Add to it in the same commit as the fix. English, identified
    by DOM handle rather than on-screen labels, and free of one person's answers.
- `autofill/` — a browser extension plus a loopback plan server that fills the forms
  Simplify does not cover (Traffit, eRecruiter, justjoin.it) from `profile.json`, and
  keeps the user's portal logins (sign-in, sign-up, save-after-login) on every https page.
  TypeScript pnpm workspace; the server imports `resolve-fields.mjs` so the extension
  and the agent resolve a question the same way. The panel fills and never submits; the
  server also speaks MCP (`/mcp`, `autofill_*` tools) so the agent can open, fill, read and —
  on an explicit `autofill_submit` after the user's OK — submit a vacancy without any
  browser tool (SKILL.md § Applier MCP fast path). `autofill_captcha` ticks a visible
  "I'm not a robot" box in any tab with a real (debugger-sent) mouse and stops at a
  challenge (SKILL.md § CAPTCHAs, `src/captcha/`).
  Meant to be published — see `autofill/README.md`.
- `templates/data-repo/` — what `setup-data-repo` copies into a new data repo.

## The system's core rule

The agent filling out an application form **never invents a fact**. If the exact
answer isn't in `profile.json` (neither in the structured fields nor in `qa[]` with
enough confidence) — stop, ask the user, record the answer via `profile-qa.mjs add`,
and only then continue. Details in `.claude/skills/apply-to-jobs/SKILL.md`.

**Where answers live:** `qa[]` holds facts, standing policies and short answers; every
story (an event — project, problem, conflict, "tell us about a time") lives in
`stories.json`, whoever supplied it. An answer the user gives that tells an event is
written there through `import-stories`, never into `qa[]` (`profile-qa.mjs add` refuses
a long narrative).
