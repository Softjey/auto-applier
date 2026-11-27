# job-triage

Sorts job postings into `SAVED` and `NOT_INTERESTED` the way you would, and records
why. It pulls vacancies from [OneTap.Work](https://onetap.work) and LinkedIn, collapses
the copies of one job that several boards serve, has an agent read every full
description against **your own** written criteria, and writes each verdict back with a
reason. It never decides from a title.

It is a set of Claude Code skills plus a few small Python scripts:

| | |
| --- | --- |
| `.claude/skills/job-triage/` | the triage run: `SKILL.md` is the procedure, `gates.md` is how a vacancy is judged, `triage.py` moves batches and verdicts around |
| `.claude/skills/job-triage/sources/` | one adapter per source: `linkedin.py` reads, `linkedin_actions.py` saves and dismisses on the site |
| `.claude/skills/applications-check/` | is this job already known: duplicated in the batch, or already in your pipeline |
| `.claude/skills/setup/` | creates your private data repo and walks you through filling it |
| `templates/data-repo/` | the skeleton of that data repo |
| `.claude/skills/*/tests/` | pytest via `uv`, no network |
| `evals/`, `fixtures/persona/` | agent evals: real runs of the skills against a fictional candidate and a mocked onetap |

## Your data stays out of this repo

This repo holds code and generic knowledge only. Your criteria, your saved LinkedIn
search, the ledger of every job you have judged and the run reports live in a **separate
private repo**, reached as `data/` at the root of this one: cloned there, or a symlink to
wherever you keep it. `data/` is git-ignored. Never give that repo a public remote:
it holds your salary floor, your company decisions and a record of every job you
rejected.

## How a run works

```
OneTap.Work ─┐                                        ┌→ OneTap.Work  (bulk status update)
             ├→ batch → cluster → agents judge ──→ route ─┼→ LinkedIn     (bookmark, optional dismiss)
LinkedIn ────┘  (one     (copies    against           └→ ledger       (what was judged, and why)
                 shape)   collapse)  your criteria
```

Scripts do the mechanical part: fetching, parsing, normalising, clustering duplicates,
routing verdicts. The agent does the part that needs reading: it applies the gates in
`gates.md` with the numbers from your `criteria.md`, and for every rejection quotes the
line of the posting that decides it. `triage.py merge` refuses a batch with gaps and
flags any quote that is not actually in the posting.

Every keeper is then checked against your OneTap pipeline before it is written, and any
keeper dropped as already known is reported to you, never dropped silently.

## Getting started

```sh
git clone https://github.com/Softjey/job-search-agent.git
cd job-search-agent
claude
```

Then ask: **"set me up"**. The `setup` skill creates your private data repo
from `templates/data-repo/`, then walks you through `criteria.md` section by section
(stack, role type, location, salary, companies, seniority, language) and generates your
LinkedIn search from the OneTap saved search. After that:

- *"check new vacancies"*, or `/job-triage` → a full run;
- *"is this job already in my pipeline?"*, or `/applications-check`.

Without an agent, create the data repo yourself and fill `criteria.md` by hand:

```sh
node .claude/skills/apply-to-jobs/scripts/init-data-repo.mjs [--dir=PATH]
```

## Requirements

- Python 3. Standard library only, nothing to install.
- Claude Code.
- A [OneTap.Work](https://onetap.work) account with its MCP server connected. It is the
  source of the `onetap` feed, the place keepers are recorded as custom vacancies, and
  what the applications check compares against. Collecting from LinkedIn alone does not
  need it.
- Optional, LinkedIn write-back only: your LinkedIn cookies in `linkedin/session.json`
  in the data repo.
- macOS or Linux. On Windows use WSL, or enable symlinks first
  (`git config --global core.symlinks true` and Developer Mode): `AGENTS.md` and
  `.agents/skills/` are symlinks.

## Your criteria

`criteria.md` in the data repo is the whole judgement: what you accept, what you reject,
and every case you have already settled. Start from the template and keep it honest:

- write rules you actually apply, ideally ones a real decision backs;
- when you correct a verdict, the correction goes into `criteria.md` in the same session
  (the Case law section), or it is made again next week;
- a gate the posting cannot settle comes back as `UNDECIDED` with a question, never a
  guess.

## Where things are found

Your data is always `data/` at the root of this repo. Without it, scripts stop and say
how to create it. See `CLAUDE.md` for the full map.

## Limits worth knowing

- **LinkedIn reading uses unofficial, logged-out endpoints.** Scraping is against
  LinkedIn's terms, they can change without notice, and heavy use from your IP gets
  throttled. The scripts are deliberately slow (a pause between requests, a low cap on
  parallel fetches); `SKILL.md` § When LinkedIn breaks covers the failures.
- **LinkedIn write-back acts on your real account.** Bookmarking keepers is on by
  request; dismissing rejections is off by default and never assumed, because a sweep
  can mean thousands of writes. Automating a logged-in session can get an account
  restricted. Skip `session.json` if you would rather not take that risk.
- **LinkedIn gives no total and a shifting sample.** The same query twice does not return
  the same postings, so a sweep is a sample of the feed, and its own tags (workplace,
  seniority, salary) are unreliable. The description body decides.
- **Agents misjudge.** Rejections are quote-checked, but the keepers and the questions are
  what you act on, so read them yourself before you apply anywhere.
- **Some defaults lean Polish.** The company-name normaliser strips `Sp. z o.o.`,
  `Polska` and similar, and salary hints recognise `zł`. Other markets work, but expect
  to widen those lists (`check.py`, `linkedin.py`) for company suffixes in your country.
- Everything personal stays in your private data repo, never here.

## Tests

```sh
uv run pytest
```

They need no network and no data repo. The scripts stay stdlib-only; pytest is a dev
dependency, installed by `uv` on first run.

These check the scripts. The agent itself is checked by the evals in `evals/`: real
Claude runs of the skills against a fictional candidate, with onetap mocked. They cost
real usage and are not run in CI. What they cover and how to run them is in
[`evals/README.md`](evals/README.md).

## Security

`linkedin/session.json` is a login credential: it is git-ignored in the data repo, never
printed and never committed. The data repo stays private.
