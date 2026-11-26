# job-search-agent

The whole job search for one candidate, under Claude Code: triage vacancies from OneTap.Work
and LinkedIn against the candidate's own criteria, tailor a resume to each one kept, and apply
in a real browser without ever inventing an answer to an application-form question — only
facts from `data/profile.json`, or the agent asks the user directly.

## Two repositories: code (here) and data (private)

**This repo contains no personal data and can be public.** Everything about one
person lives in a separate, private **data repo**, reached as `data/` at the root of
this repo (a clone, or a symlink; git-ignored):

| In the data repo | What it is |
| --- | --- |
| `criteria.md` | what the candidate accepts and rejects, why, and every case already adjudicated |
| `linkedin/filters.json`, `ledger.json`, `session.json` | the saved LinkedIn search, every LinkedIn job already judged, the cookies for save and dismiss (git-ignored) |
| `skills.csv` | every skill rated 0–5, the source a resume is written from |
| `CV_Base.html`, `resume-config.json` | the base resume with its three placeholders, and the file name a recruiter sees |
| `out/` | generated resumes, one folder per vacancy, sorted by status |
| `profile.json` | the user's structured facts + the `qa[]` bank of form answers |
| `apply-config.json` | the resume to send, `formVocabulary` for non-English forms |
| `stories.json` | STAR stories (tagged `themes` / `stack`) and about-me texts that free-text fields are grounded in |
| `credentials.json` | the user's employer-portal logins, kept by the extension's password manager (private; real passwords) |
| `triage/` | `<date>-vacancies.md` per job-triage run, `<date>.md` per apply-method-triage of the SAVED queue |
| `runs/<date>-<slug>/` | audit trail of each apply run — per vacancy `answers.md`, `salary.json`, the CV sent, screen recordings; plus `summary.md` |

Open Claude Code at the root of this repo. Skills name data files by their literal
path (`data/profile.json`, `data/runs/…`); scripts reach the same place through
`scripts/lib/data-dir.mjs` (`$APPLIER_DATA_DIR` overrides it, for tests only). A
symlinked `data` needs its real folder in `.claude/settings.local.json` →
`permissions.additionalDirectories`, which `init-data-repo.mjs --dir` writes. Search
inside it with an explicit `data/`: `grep -r X .` does not follow the symlink.
**No `data/` yet → run the `setup-data-repo` skill** (it scaffolds one from
`templates/data-repo/` and hands over to `profile-interview`).

Rules that follow from the split:

- **Never put personal data in this repo** — not in code, skills, ATS notes, tests
  or fixtures. Tests use the fake person in `autofill/fixtures/`, evals the fictional
  candidate in `fixtures/persona/`. ATS notes use
  placeholders (`123456789`, `<config.resumeFileName>`). The root `.gitignore`
  blocks the data files so they cannot be committed here by accident.
- **Never add a public remote to the data repo.** It holds a phone number, salary
  expectations, work-authorization status, every answer given to an employer and
  recordings of filled-in forms. Private remotes only.
- Triage output is Markdown only, in the data repo's `triage/`, never in `runs/`.
- `criteria.md` decides every verdict; update it in the same session when the candidate
  corrects one. `linkedin/ledger.json` is written by `linkedin.py record`, not by hand.
  `linkedin/session.json` is a credential: never print it, never commit it.
- Only the user edits `skills.csv`, `CV_Base.html` and `resume-config.json`; the skills
  only read them.

## Related services

- **OneTap.Work MCP** — the source of vacancies and SAVED applications, and where every
  verdict and the final status is written (`bulk_update_applications`,
  `update_application_status`). It is the single source of truth for what has been
  applied to — this system keeps no separate application ledger. `vacancy.link` is the
  only field used for browser navigation; `vacancy.applyLink` is an internal server
  field, never used directly.

## Browser

`.claude/skills/apply-to-jobs/browser/README.md` names the five browser capabilities the
apply run needs and the tools that provide them. `SKILL.md` names capabilities and that file
names tools: a browser-specific detail belongs there, never in the phases.

## Structure

The skills run in one pipeline: `job-triage` (with `applications-check`) keeps or rejects
vacancies → `resume-blocks` → `resume-render` → `resume-pdf` tailor a resume for each one
kept → `apply-method-triage` and `apply-to-jobs` apply. Setup: `setup-data-repo` and
`setup-job-triage`, `profile-interview`, `import-stories`.

### Triage

- `.claude/skills/job-triage/SKILL.md` — the triage procedure, covering every
  source in one run. Invoke with `/job-triage`, or just ask to check new
  vacancies.
- `.claude/skills/job-triage/gates.md` — how a vacancy is judged: Gate 0 to
  Gate 6, notes, duplicates. The same for everyone. **Read it, and the
  candidate's `criteria.md`, before judging any vacancy**, including a one-off
  question about a single posting.
- `.claude/skills/job-triage/triage.py` — normalises every source into one
  batch to judge, and routes the verdicts back to the right call.
- `.claude/skills/job-triage/data_dir.py` — the path of `data/` for the Python scripts.
- `.claude/skills/setup-job-triage/SKILL.md` — the guided triage setup: create `data/`
  if missing, fill `criteria.md`, generate the LinkedIn search.
- `.claude/skills/applications-check/SKILL.md` — whether a job is already
  known, in three senses: duplicated inside the batch (it clusters those before
  judging, keeping the copy with the most information), already in the onetap
  pipeline (it flips those to `NOT_INTERESTED` after the gates), and held twice
  by the pipeline itself (`check.py pipeline` builds a batch out of `SAVED` and
  `APPLIED` and clusters that — same engine, no writes, a report to act on).
  Invoke with `/applications-check`; the triage run calls it at steps 3 and 7.
  The measured thresholds live in that file — re-measure before changing one.
- `.claude/skills/job-triage/sources/` — one adapter per source, split into a
  read half and a write half. `linkedin.py` pulls postings from LinkedIn's
  public `jobs-guest` endpoints (no login, stdlib only); `linkedin_actions.py`
  bookmarks and dismisses jobs on LinkedIn itself and is the only piece that
  needs a logged-in session. `LINKEDIN.md` records what the guest search
  honours and what it ignores.
- `tests/` inside each skill — pytest (run through `uv`), no network and no data repo
  needed: `uv run pytest` at the root. The scripts themselves stay stdlib-only.

### Resumes

- `.claude/skills/resume-blocks/` — the Title, Summary and Skills blocks for one vacancy,
  grounded in `data/skills.csv`; `skills.mjs` is a lookup over it, not a decision-maker.
- `.claude/skills/resume-render/` — a copy of `data/CV_Base.html` with the three
  placeholders replaced, into `data/out/<Company>-<Position>/`.
- `.claude/skills/resume-pdf/` — the HTML as one continuous PDF page.
- `.claude/skills/organize-by-status/` — sorts `data/out/` into per-status folders from
  the OneTap.Work status (session cookie in a git-ignored `.env.local`).
- `my-career-profile/skills-rating/` — a local app for rating `skills.csv`.

### Applying


- `.claude/skills/setup-data-repo/` — creates the user's private data repo as `data/`
  from `templates/data-repo/` (`scripts/init-data-repo.mjs`, the one script that creates
  it for every skill), or links `data/` to one elsewhere.
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
  - `scripts/lib/data-dir.mjs` — the path of `data/` for the scripts; every script goes through it.
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
    `scripts/lib/story-themes.mjs`; `tests/story-themes.test.mjs` is its regression
    test (`pnpm test` after touching the keys). There is no importer.
  - `scripts/credentials.mjs`, `scripts/lib/credentials-store.mjs` — the portal-account
    store (`credentials.json`, schema 2), shared with the autofill extension's password
    manager. The extension fills sign-ins and creates accounts (generated, never-reused
    password, saved before the submit); the agent presses the portal's own buttons and
    never reads or types a password. `credentials.mjs status` answers "is there an
    account?" without a secret.
  - `scripts/check-server.mjs` — is the autofill plan server up (any HTTP answer = up; it only
    talks to the extension)? Down means no CV list and no "Save password?"; the apply run
    checks it before the first browser step.
  - `tests/` — vitest over the scripts, run as subprocesses against a temp copy of the
    fake person in `autofill/fixtures/`. `pnpm test` at the repo root; CI runs it too.
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

### Shared

- `templates/data-repo/` — what `init-data-repo.mjs` copies into a new data repo.
- `evals/`, `fixtures/persona/` — agent evals (`claude plugin eval`) against a fictional
  candidate and a mocked OneTap.Work; run them with `evals/run.sh`, see `evals/README.md`.
  Not part of CI. The triage mocks are generated from `fixtures/persona/inputs/`: change the
  fixture and run `python3 evals/build_mocks.py`. After changing a skill, re-run the evals it
  touches.
- `tests/` — checks shared by every skill (`test_eval_mocks.py`). Each skill's own tests
  are in its folder: `pnpm test` (vitest) and `uv run pytest` at the root; CI runs both.

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

## Working on triage


- **Never judge a vacancy from its title — or its `keywords`.** The stack that
  disqualifies a role is usually only in the description body, and the title and
  keyword tags routinely name a technology the body demotes or drops entirely.
  Judge on the requirements section.
- Every status change gets a note in English naming the reason. A batch without
  notes has to be re-read from scratch to audit it.
- Roughly 10% of a batch is one job returned twice — the aggregators serve the
  same posting from several boards, and none of the copies is in the pipeline
  yet. They are collapsed before judging, but only on evidence: same company, no
  seniority conflict, and 3-shingle containment of the descriptions at or above
  0.85. A shared title is **not** enough, and neither is a high score alone
  (boilerplate shared across different roles scores high). Everything between
  0.50 and 0.85 is reported and judged separately.
- Neither the 0.50-0.85 band nor the cross-company band merges anything — both
  members are always read and judged on their own, whatever band they land in.
  So they cost nothing to defer: `cluster` reports them raw, before any verdict
  exists, but `applications-check`'s `match` step re-filters both down to
  `suspected_duplicates_live` / `same_job_different_company_live` once every
  member has a verdict, dropping a group only when every member ended up
  `NOT_INTERESTED`. A ref with no verdict at all is never treated as rejected,
  so a group is never dropped on missing information.
- The copy that survives a collapse is the one carrying the most information,
  not the first one seen — salary weighs most, because Gate 4 turns on it and
  most postings omit it. The survivor absorbs the others' fields, and anything
  they disagree on rides along as `duplicates_disagree_on` for Gates 3 and 4 to
  read.
- Nothing is ever dropped in silence. A collapsed copy keeps its ref, inherits
  its primary's verdict, and is written back to its own source — that is what
  stops the feed serving it again, and it is why a wrong collapse is the
  expensive mistake: the candidate never learns the vacancy existed.
- Two agencies advertising one end client's role under their own names are
  **never** merged — the company names differ and the text nearly matches
  (cross-company containment is far lower than same-company containment, so
  anything above 0.35 is flagged). Ask the candidate which agency to go
  through: applying via both can sink both applications. If they settle it as
  a rule, that rule goes in `criteria.md`. One spelling is resolved before the
  flag fires: an abbreviation against the full name, when both are in the batch
  and only one full name claims the initials, is one agency.
- When the candidate corrects a verdict, update `criteria.md` so the correction
  survives the session.
- One judgement, many sources. A source changes only how a vacancy is fetched
  and how its verdict is written; `criteria.md` decides in every case. Adding a
  source means a `normalise_*` function and a `route` branch in `triage.py`,
  and nothing else.
- Sources run independently or together — `triage.py sources` lists them,
  `batch` takes whichever `--onetap` / `--linkedin` files you have, and
  `route --only <source>` writes one source's verdicts at a time. Prefer a full
  sweep anyway — the feeds overlap, and the applications check collapses what
  the sweep sees twice.
- A triage run asks first how hard to parallelise: how many workers fetch
  LinkedIn descriptions (capped at 4), and whether agents judge the batch in
  parallel (`triage.py chunk`, then `merge`, which refuses gaps and flags
  rejections whose quote is not in the posting). Writes to LinkedIn are never
  parallelised — save and dismiss stay one call at a time with their pause,
  because a burst of writes is what would put the account at risk.
- The two sources keep their search in different places. onetap has a real
  saved search on the account (`useSavedFilters: true`); LinkedIn's guest API
  has none at all, so `linkedin/filters.json` **is** the saved filter. Keep it
  in sync with `linkedin.py sync-filters <get_my_filters dump>`; its
  `exclude_keywords` keeps keywords measured as dead weight out of the search
  even while onetap still lists them.
- LinkedIn's search is a **matrix**, because it has one location box and one
  workplace toggle and so cannot express "remote in one country OR hybrid in
  two cities" in one query. Keywords × location groups × time windows are
  crossed and each cell is fired separately; the union is the feed. Check the
  cost with `search --dry-run` before spending it. Each cell pages **to the
  end** — there is no page cap, because a small cap silently hides most of a
  broad query. A full two-week sweep takes an hour or more; narrow it with
  `--keyword` / `--location`, not with `--max-pages`.
- `collect` can be stopped at any point and resumed. Its output is rewritten
  after every query (and every 25 descriptions) as a valid snapshot of complete
  records, Ctrl-C/SIGTERM saves and exits 130, and the same command again
  carries on from `<out>.run/`. Judge the snapshot while the rest comes in —
  what reaches the ledger meanwhile is left out on resume.
- On LinkedIn only **keywords, geoId/location and `f_TPR`** actually bite.
  `f_WT` is *proven ignored*, `f_E` is unreliable, `f_JT` unproven, and the
  endpoint returns a shifting sample. The measurements are in
  `sources/LINKEDIN.md`; do not re-add those filters because they look
  sensible.
- `workplace` in the LinkedIn config is declared intent, not a filter. It rides
  along as `expected_workplace` so the judge knows what a query aimed at — but
  it is **not evidence**, and Gate 3 still reads the location out of the body.
- LinkedIn's own filters and tags are unreliable — roles tagged remote are
  frequently on-site, senior roles are tagged `Associate`, and salary is absent
  from the guest view entirely. The queries cast wide on purpose and the
  description body decides.
- A keeper is not finished when it passes the gates — it still has to be new.
  Every `SAVED` verdict goes through the applications check before it is
  written: the same job is often already in the pipeline, saved from another
  board, applied to weeks ago, or rejected in an earlier batch. A hit becomes
  `NOT_INTERESTED` with a note naming what it duplicates, and **is always
  reported to the candidate** — a keeper dropped silently is indistinguishable
  from one that never existed. A pipeline can hold thousands of applications, so
  the check queries `get_my_applications` per company; it never dumps them all.
- Verdicts on LinkedIn jobs go in `linkedin/ledger.json` whichever way they
  fall. Rejections are deliberately not pushed to onetap — the ledger is their
  record, and it is what stops them coming back on the next run.
- A LinkedIn verdict also has to reach LinkedIn: `route --apply-linkedin`
  bookmarks every keeper on the site. Rejections are **not** dismissed unless
  `--dismiss-rejections` is passed, and that flag is **never passed unasked** —
  a sweep rejects thousands and every dismissal is its own throttled write, so
  the run asks up front and the default is no. The ledger only stops the script
  from re-reading a job; only a dismiss stops LinkedIn re-showing it, so offer
  it rather than assume it, and report how many were withheld. A keeper is
  written twice — bookmarked on LinkedIn, and created as an onetap custom
  vacancy.
- Reading LinkedIn needs no login; writing to it needs `linkedin/session.json`
  with `li_at` and `jsessionid`. `JSESSIONID` **is** the csrf token, so both
  cookies are required and `li_at` alone gets a 403. Keep the two halves in
  separate modules — a collection run must never fail on an expired login.
- Every dismiss is reversible (`linkedin_actions.py undo-dismiss`), and every
  save (`unsave`). When the candidate corrects a verdict, undo it on LinkedIn
  too, or the correction never reaches the site.
- A gate that cannot be settled from the posting gets verdict `UNDECIDED` with a
  question, not a guess. Undecided items are written nowhere and resurface next
  run.
