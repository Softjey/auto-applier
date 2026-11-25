# Job triage

Code for triaging job postings from onetap.work (through the `onetap` MCP
server) and LinkedIn against a candidate's own criteria. This repo holds code and
generic knowledge only. Everything about one person lives in a separate private
**data repo** (see "Where the data lives").

## What is here

- `.claude/skills/job-triage/SKILL.md` — the triage procedure, covering every
  source in one run. Invoke with `/job-triage`, or just ask to check new
  vacancies.
- `.claude/skills/job-triage/gates.md` — how a vacancy is judged: Gate 0 to
  Gate 6, notes, duplicates. The same for everyone. **Read it, and the
  candidate's `criteria.md`, before judging any vacancy**, including a one-off
  question about a single posting.
- `.claude/skills/job-triage/triage.py` — normalises every source into one
  batch to judge, and routes the verdicts back to the right call.
- `.claude/skills/job-triage/data_dir.py` and `init_data_repo.py` — where the
  data repo is, and how to create one from `templates/data-repo/`.
- `.claude/skills/setup-job-triage/SKILL.md` — the guided setup: create the data
  repo, fill `criteria.md`, generate the LinkedIn search. Run it on a fresh clone.
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
- `templates/data-repo/` — the skeleton of the data repo.
- `tests/` — pytest (run through `uv`), no network and no data repo needed.
  Run `uv run pytest` before committing a change to a script. The scripts
  themselves stay stdlib-only; pytest is a dev dependency in `pyproject.toml`.
- `.agents/skills/` — symlinks to `.claude/skills/`, for agents that read that
  folder.

## Where the data lives

A private data repo, found by the first of:

1. `$JOB_TRIAGE_DATA_DIR`
2. the path written in `.data-dir` at the root of this repo (git-ignored)
3. a sibling folder named `<this repo's folder>-data`

Create one with `python3 .claude/skills/job-triage/init_data_repo.py [--dir PATH]`.
It holds:

- `criteria.md` — what the candidate accepts and rejects, why, and every case
  already adjudicated.
- `linkedin/filters.json` — the saved LinkedIn search. LinkedIn has no saved
  search, so this file is the equivalent. Edit it, or regenerate it from onetap
  with `linkedin.py sync-filters`.
- `linkedin/ledger.json` — every LinkedIn job already judged, with its verdict
  and reason. LinkedIn has no application status of its own, so without this
  every run would re-read everything. It is also the only record of the
  rejections, which are deliberately not written to onetap.
- `linkedin/session.json` — the browser cookies the write half needs.
  Git-ignored, and the only credential in the project.
- `triage/` — one report per run.

## Working here

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
