# Career profile — resume tailoring

Agent skills that tailor a resume to one specific job posting without inventing anything. The
source of truth is `skills.csv`: every skill rated 0–5. The agent rewrites only the top of the
resume — Title, Summary and the Skills block — and only claims what the ratings back. Contacts,
experience and education are copied from the base resume as they are.

The pipeline is four separate skills, each doing one job:

1. `resume-blocks` — the agent reads the vacancy and writes the Title, Summary and Skills blocks.
2. `resume-render` — puts the blocks into a copy of `CV_Base.html`.
3. `resume-pdf` — prints the html to a PDF that is one long page.
4. `organize-by-status` — sorts the vacancy folders in `data/out/` by their onetap status.

Next to them, `apps/skills-rating/` is a small local app for rating the skills in `skills.csv`.

## Repository layout

```text
.claude/skills/        the four skills above
apps/skills-rating/         the rating app (Vite + React)
templates/data-repo/   skeleton of the private data repo
.claude/skills/*/tests/ unit tests of the skill scripts (vitest)
evals/                 agent evals (claude plugin eval), see evals/README.md
fixtures/persona/      a fictional candidate the evals and tests run on
data/                  the private data repo (git-ignored; a clone or a symlink)
```

## Personal data

Code and data are separate. `skills.csv`, `CV_Base.html`, `resume-config.json` and `out/` live in a
separate private repository, reached as `data/` at the root of this one (cloned there or symlinked,
git-ignored). How to create your own data repository — `templates/data-repo/README.md`.

## Resume blocks for a vacancy

`.claude/skills/resume-blocks/` — a skill for the agent: writes the Title, Summary and Skills
blocks for one specific vacancy from the ratings in `skills.csv`.

- `SKILL.md` — the rules: how to clean the vacancy title, how to build the summary, how to group
  the skills block and in what order, which ratings allow a skill to be mentioned (4–5 freely, 3 in
  prose only with a hedge, 2 — only at the tail of a skills block line and only when the vacancy
  asks for it, ≤1 — never).
- `skills.mjs` — a lookup over the base. The agent analyses the vacancy; the script only answers
  what a term is rated, whether it is in the base, and whether everything needed made it into the
  skills block:

```bash
node .claude/skills/resume-blocks/skills.mjs rate "React" "Next.js" "Rust"
node .claude/skills/resume-blocks/skills.mjs search "state management"
node .claude/skills/resume-blocks/skills.mjs list --min=4 --grep=test
node .claude/skills/resume-blocks/skills.mjs check draft.txt "React" "Kubernetes"
```

`check` takes a skills block draft and the vacancy terms and shows what was forgotten (rated ≥3 but
not in the block), what leaked in (rated ≤1, or weak without the vacancy asking for it), what is in
the wrong place (rating 2 must be at the end of its line) and what could still be added (rating 2
from the vacancy). Exit code 1 if there is anything to fix.

Years of experience are not hardcoded anywhere: the agent reads the `EXPERIENCE` section of
`CV_Base.html` and takes the start year of the earliest role that really is commercial
development.

The skill never changes `skills.csv` or `CV_Base.html` — it only reads them.

## Assembling the resume for a vacancy

`.claude/skills/resume-render/` — a separate system: it writes nothing itself, it only puts
finished blocks into a copy of `CV_Base.html` in place of the `[Position placeholder]`,
`[Summary placeholder]` and `[skills placeholder]` placeholders. The rest of the resume (contacts,
experience, education, open source) is copied as is.

```bash
node .claude/skills/resume-render/render.mjs blocks.md --company="Acme"
node .claude/skills/resume-render/render.mjs blocks.md --out=cv.html   # "-" = stdout
node .claude/skills/resume-render/render.mjs placeholders              # what the base declares
```

`blocks.md` is the `resume-blocks` skill output as is (`Title`, `Summary`, `Skills` sections;
comments after the skills block are ignored). Overwriting an existing file needs `--force`.

One vacancy — one folder `data/out/<Company>-<Position>/`, and the file inside always has the same name:

```text
data/out/Acme-Senior-Frontend-Developer/<resumeFileName>.html
data/out/Acme-Senior-Frontend-Developer/<resumeFileName>.pdf
```

The file name comes from `resumeFileName` in `resume-config.json` (without `.pdf`; `CV` without the
config) — it is what a recruiter sees in their downloads, so the company stays in the folder; a
leading `!` keeps the file at the top of a Finder listing. The name may start with `!`, so quote the
path in single quotes in a terminal — in an interactive zsh double quotes do not stop history
expansion.

The script only reads `CV_Base.html` — only the user edits the base resume.

## A PDF as one long page

`.claude/skills/resume-pdf/` — one more separate system: html → pdf where the paper height equals
the content height, so the file has exactly one page and no break in the middle of the text.

```bash
node .claude/skills/resume-pdf/topdf.mjs 'data/out/Acme-Senior-FE/<resumeFileName>.html'
node .claude/skills/resume-pdf/topdf.mjs cv.html --side=14   # side margins, mm
node .claude/skills/resume-pdf/topdf.mjs browsers            # which Chromium will be used
```

Flags: `--out=`, `--width=` (mm, default 210), `--pad=` (bottom padding, mm, default 8),
`--side=` (side margins, mm), `--scale=`, `--browser=` (or `CHROME_PATH`), `--force`.

The side margins come from the html itself: the Google Docs export gives `body` a
`padding: 9pt 57.6pt` (20.3 mm on each side) and a `max-width: 480.1pt`. `--side` overrides that in
the browser while printing — the file stays untouched. The text reflows, so the page gets shorter;
the height is measured after the override, so one page is still guaranteed.

No dependencies: the script drives headless Chromium over the DevTools protocol through Node's
built-in `WebSocket`. It finds a browser by itself — the Playwright/Puppeteer cache, then Chrome,
Chromium, Edge, Brave, Arc. After printing it counts the pages in the finished PDF and fails if
there is more than one.

## Tests

```bash
pnpm install
pnpm test   # vitest run, at the repo root
```

Unit tests of the skill scripts on vitest, a dev dependency only: the scripts themselves still need
nothing installed. They use made-up people only, never the data repo.

- `resume-render/tests/render.test.mjs` — `render.mjs`: parsing the blocks, finding the placeholders (any letter
  case, split by formatting, missing), the skills line as a paragraph or a list item and the cases it
  refuses, escaping, the structure check, and that nothing outside the skills line changes.
- `resume-blocks/tests/skills.test.mjs` — `skills.mjs` on a small csv: every verdict, spelling variants, `search`,
  `list` filters, and `check` (missing, optional, forbidden, misplaced and unasked rating-2 items).
- `organize-by-status/tests/organize.test.mjs` — `organize.mjs` and folder discovery in a temp `out/`: dry run, moves
  by id and by folder name, re-sorting, conflicts, unmatched folders.
- `resume-pdf/tests/topdf.test.mjs` — `topdf.mjs` argument handling; the real print to a one-page PDF runs only
  when a Chromium is found.

The agent itself is checked by the evals in `evals/` — real Claude runs of the skills against a
fictional candidate. They cost real usage and are not run in CI; see
[`evals/README.md`](evals/README.md).

## Skills rating app

A local site for rating skills from 0 to 5. The data source and the place it saves to is
`data/skills.csv`. No database, no cloud storage: everything is written straight
to the file.

```bash
cd apps/skills-rating
npm install   # once
npm run dev   # → http://localhost:5173
```

### Using it

- Click the stars to rate 1–5, the `0` button for zero, click the same rating again to clear it.
- Keys on a row (a row gets focus on click or <kbd>Tab</kbd>):
  - <kbd>0</kbd>–<kbd>5</kbd> — rate
  - <kbd>Backspace</kbd> — clear the rating
  - <kbd>S</kbd> — toggle “seen”
  - <kbd>↑</kbd> / <kbd>↓</kbd> — move between skills
- Filters: search, ratings (including “unrated”), “seen”, sorting (sorting is visual only — the row
  order in the CSV never changes).
- The form at the bottom of the list adds a new skill, `✕` on a row deletes it.
- Changes save automatically (400 ms debounce); the status is shown at the top right.

### The file

- The `skills.csv` format is kept as is: the same columns and order, the same line separator.
  Unchanged rows stay byte-for-byte.
- Both layouts are supported: `skill,rating,already_seen` and a variant with a `section` column
  (then a sidebar with sections appears). Columns the app does not know are kept unchanged.
- An empty `rating` cell means “not rated yet” (“unrated” in the app).
- Writes are atomic (`skills.csv.tmp` → `rename`, on the real path behind a symlinked `data`); a
  `skills.csv.bak` is created before the first write.
- If the file is changed in an editor while the page is open, the app will not overwrite the edits:
  it shows a conflict and offers to reload the file.

### Structure

- `apps/skills-rating/server/skillsApi.ts` — a Vite plugin with `GET`/`PUT /api/skills` (reading and
  writing the CSV).
- `apps/skills-rating/src/lib/csv.ts` — a CSV parser and serializer that keeps the file format.
- `apps/skills-rating/src/hooks/useSkills.ts` — state, autosave, conflict handling.
- `apps/skills-rating/src/components/` — toolbar, section card, skill row, rating control.

The CSV path can be overridden with the `SKILLS_CSV` variable (handy for experiments on a copy):

```bash
cd apps/skills-rating
SKILLS_CSV=/tmp/test.csv npm run dev
```
