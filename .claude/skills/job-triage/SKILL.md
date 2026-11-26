---
name: job-triage
description: Triage vacancies from every source — the onetap.work feed and LinkedIn — against the candidate's calibrated criteria. Collects new postings, reads each full description, and records SAVED or NOT_INTERESTED with a reason. Use whenever the user asks to check, filter, review or sort through job postings, to pull jobs from LinkedIn, or to re-check earlier decisions.
---

# Job triage

Sort vacancies into `SAVED` and `NOT_INTERESTED` the way the candidate would,
and record why.

Read `gates.md` in this skill directory and the candidate's `data/criteria.md`
before making any verdict. `gates.md` is how a vacancy is judged;
`criteria.md` holds the candidate's rules, the precedents, and the reasoning
behind both. `data/` at the repo root is the candidate's private data repo (a
clone or a symlink); when it is missing, run the `setup-job-triage` skill. This
file is the procedure.

**One judgement, many sources.** `criteria.md` decides regardless of where a
posting came from. What differs per source is only how vacancies are fetched
and how a verdict is recorded, and `triage.py` absorbs both so the middle of
the run — reading and judging — is identical.

| Source | Fetched with | "Already judged" is tracked by | Verdict written with |
|---|---|---|---|
| onetap.work | `search_vacancies` (MCP) | server-side application status | `bulk_update_applications` |
| LinkedIn | `sources/linkedin.py` | `linkedin/ledger.json` | `sources/linkedin_actions.py` + `create_custom_vacancy` + ledger |

A LinkedIn verdict lands in **three** places, and all three matter:

| Verdict | On LinkedIn | On onetap | In the ledger |
|---|---|---|---|
| `SAVED` | bookmarked | `create_custom_vacancy` | recorded |
| `NOT_INTERESTED` | nothing by default — **dismissed only if the candidate asks** | nothing | recorded |
| `UNDECIDED` | nothing | nothing | nothing — it resurfaces next run |
| `UNREADABLE` | nothing — the posting is already gone | nothing | recorded |

LinkedIn has no pipeline of its own, so survivors are written into onetap as
custom vacancies and live in the normal pipeline from then on.

Dismissing a rejection is what keeps the candidate's own LinkedIn feed usable —
the ledger only stops *this script* from re-reading it, not LinkedIn from
re-showing it. But dismissing is **off by default and never assumed**. A sweep
rejects thousands (2882 of 3039 on 2026-09-12), each dismissal is a write on
the real account sent one at a time with its pause, and the candidate decided
on 2026-09-12 that this is theirs to approve per run. Ask, and pass
`--dismiss-rejections` only on a yes.

## Running one source, or all of them

Sources are independent. Run whichever you want — the steps are the same, you
just pass fewer flags.

```bash
S=.claude/skills/job-triage
python3 $S/triage.py sources          # what exists, its state, its filters
```

**LinkedIn only:**

```bash
python3 $S/triage.py collect --source linkedin --max-age-days 7 --workers 2 -o /tmp/linkedin.json
python3 $S/triage.py batch --linkedin /tmp/linkedin.json -o /tmp/batch.json
python3 $C/check.py cluster --batch /tmp/batch.json -o /tmp/batch.clustered.json
# ... judge, then check the keepers against the pipeline ...
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json
```

**onetap only:** save **every page** of the `search_vacancies` response (follow
`nextCursor` to the end — see step 1) into `/tmp/onetap.json`, then

```bash
python3 $S/triage.py batch --onetap /tmp/onetap.json -o /tmp/batch.json
```

**Both:** pass both flags to `batch`. Prefer it for a full sweep — the two
feeds overlap heavily, and clustering only collapses copies that are in the
same batch.

`route` dispatches on each verdict's `ref`, so a mixed verdicts file needs no
flags. To write one source's verdicts at a time — say, the onetap updates now
and the LinkedIn creates after checking them — add `--only onetap` or
`--only linkedin`.

## How the filters differ

The two sources store their search in completely different places, and this
trips people up.

| | onetap.work | LinkedIn |
|---|---|---|
| Where the filter lives | server-side, on the account | `linkedin/filters.json`, in this repo |
| How it is applied | `search_vacancies` with `useSavedFilters: true` | params on each request |
| How to change it | `update_my_filters`, after confirmation | edit the file, or `sync-filters` |
| Shape | one structured query | a **matrix** of many queries |
| What it filters on | structured metadata onetap parsed | mostly full-text keyword search |

**onetap** has a real saved search: categories, keywords, three workplace groups
each with their own cities and countries, experience levels, employment types,
company size, date posted. Pass `useSavedFilters: true` rather than
transcribing it — a forgotten per-workplace `cities` silently returns worldwide
results.

**LinkedIn has no saved search at all** on the guest API. Job Alerts exist but
live behind a login. So `linkedin/filters.json` *is* the saved filter,
kept in the repo instead of on an account.

### Keep it in sync with onetap

onetap is the source of truth for what the candidate is looking for:

```bash
# save get_my_filters output to /tmp/onetap-filters.json first
python3 $S/sources/linkedin.py sync-filters /tmp/onetap-filters.json --dry-run
python3 $S/sources/linkedin.py sync-filters /tmp/onetap-filters.json
```

It copies over the keywords, the three workplace groups with their cities and
countries, and the date window. It deliberately does **not** copy categories
(LinkedIn has no equivalent), experience levels (its filter is unreliable), or
green/red words — those are judgement, and judgement lives in `criteria.md`.

It also leaves out every keyword listed under `exclude_keywords` in
`filters.json`, even while onetap still has it. onetap matches structured data
and LinkedIn only full text, so a keyword can earn its place in one and not the
other. Each entry records the measurement behind it: on 2026-09-10 `front-end`
(1 posting no other keyword found — a duplicate of `Frontend`) and `Tailwind`
(9 such postings, none kept, 58% not development at all) were dropped.
Re-measure before adding one — per keyword, count the postings no other
keyword found and how many of those were kept.

### Why it is a matrix

LinkedIn has one location box and one workplace toggle, so it cannot express
what onetap expresses in a single query:

> remote anywhere in one country **OR** hybrid/onsite in two named cities

So the search is a cross product — every keyword × every location group × every
time window — and each cell is fired as its own request. The union of their
results is the feed. 7 keywords × 3 location groups is 21 queries; check the
expansion before spending them:

```bash
python3 $S/sources/linkedin.py search --dry-run
```

Narrow a run with `--location remote-poland`, `--keyword React`, or
`--max-pages`, all repeatable.

### Pagination: every query runs to the end

The endpoint serves 10 cards a page and reports no total, so a result set is
finished only when it says so — with a 0-card page. Every page before that
comes back full. There is **no page cap**, and adding one back is a mistake
that hides most of the feed. Measured 2026-09-10, run to the end:

| Query | Postings | Pages | A 3-page cap saw |
|---|---|---|---|
| `React` / Warsaw / 14d | 68 | 9 | 28 |
| `Typescript` / Poland / 14d | 402 | 45 | 28 |

The old `maxPages: 3` default read like a page limit but was really a silent
93% truncation on the broad queries. `--max-pages` still exists for cheap
sampling while iterating; do not use it for a real sweep.

That made a full uncapped 14-day sweep of the original 27 queries roughly
**600–900 search requests** at ~1.75s each — on the order of 20–30 minutes before a single
description is fetched. Run `--dry-run` first, and prefer narrowing by
`--keyword` / `--location` over capping pages when a full sweep is too much.

Because the sample drifts between requests, a page can re-serve cards already
held without the set being exhausted. One such page is pushed through; two in
a row ends the query (`STALL_PAGES` in `linkedin.py`).

### What actually works, measured 2026-09-10

The endpoint returns a **shifting sample**, not a stable list: the same query
twice, 50 cards each, shared only 27 of ~47 results. That drift is the control
any filter claim has to beat, so comparing result sets alone proves nothing.

- **`keywords` works** — the endpoint is search-driven. This is the main lever.
- **`geoId` works, precisely.** `105076658` returned 30/30 postings in Warsaw;
  `106191263` returned only Pomorskie. A plain `location` string is just as
  good where no geoId is known — `"Gdansk, Poland"` gave 20/20 in the tri-city.
- **`f_TPR` works.** With `r86400` every result was posted today or yesterday;
  with `r1209600` the oldest was 14 days out and nothing fell outside the
  window; without it the same pages reached back to 2025-06-30.
- **`f_WT` is ignored — proven, not assumed.** `f_WT=2` (remote) and `f_WT=1`
  (on-site) are mutually exclusive, yet over 50 cards each they shared 30
  results, *more* overlap than the control run.
- **`f_E` is unreliable** (`f_E=4` returns `Not Applicable` and `Associate`),
  and **`f_JT` is unproven**.

So the real levers are **keywords + geoId/location + `f_TPR`**. Everything else
stays wide and `criteria.md` filters from the description body.

`workplace` in the config is therefore **declared intent, not a filter**. It
records which onetap workplace group a location group came from and rides along
on every posting as `expected_workplace`, so the judge knows what the query was
aiming at. Because the guest backend ignores it, two location groups differing
*only* by workplace are collapsed into one request rather than fired twice —
and a `voyager` backend, which does honour it, would send them separately.

**`expected_workplace` is not evidence.** A posting found by the `remote-poland`
cell has not been confirmed remote by anyone; Gate 3 still reads the location
out of the body.

## Procedure

### 0. Ask how hard to parallelise

Before collecting, ask the candidate — one `AskUserQuestion` call, only the
questions that apply to this run's sources:

1. **Description fetches** (LinkedIn): 1, 2 (recommended) or 3 workers →
   `--workers` in step 1. Reads send no cookies, so the account is never
   exposed; but the IP is the one the candidate's browser uses, and LinkedIn
   throttles bursts. On a 429 every worker backs off together, and the code
   caps it at 4 whatever is asked. On 2026-09-10 one worker took 29 minutes
   for 463 descriptions, with one timeout and no 429s.
2. **Judging**: 5 agents (recommended), 3 agents, or sequentially yourself →
   "Judging in parallel" under step 5. Read sequentially, 375 postings took 35
   minutes on 2026-09-10. Agents cut the wall-clock; the extra cost is each
   one reading `criteria.md` on top of its share of the postings.
3. **Dismiss the rejections on LinkedIn at the end?** Default **no**, and say
   so when asking. A yes is one write per rejected posting — 2882 of them on
   2026-09-12 — each sent on its own with a pause. Declining loses nothing: the
   ledger already stops this script from re-reading them, and they can be
   dismissed in a later pass. Only a yes earns `--dismiss-rejections` in step 8.

If the candidate already said how in this request, use that and do not ask.

**Writes are never parallelised**, whatever the answers: save and dismiss on
LinkedIn stay one call at a time with their pause. That is the candidate's
decision (2026-09-10) — a burst of writes is what would put the account at
risk.

### 1. Collect

**onetap.** Call `get_my_filters`, then `search_vacancies` with
`useSavedFilters: true` and `applicationStatus: "NONE"`. Prefer
`useSavedFilters` over transcribing the fields by hand — a forgotten
per-workplace `cities` / `countries` silently returns worldwide results.
Save the response to `/tmp/onetap.json`.

**Page to the end, and never trust `total`.** A response carries `total`,
`maxExactCount` and `nextCursor`. `total` is **capped** at `maxExactCount`
(100), so `total: 100` means "100 or more", not "100". On 2026-10-01 that was
read as the whole feed: page 1 was judged and reported as "100 new" while page 2
held 90 more, and the candidate had to catch it. The feed is finished only when
`nextCursor` is absent. Use `limit: 100`, pass each `nextCursor` back as
`cursor` unchanged, and stop only when a response has none. Responses this size
are saved by the harness to a `tool-results/*.txt` file, so read them with
Python, not by eye:

```bash
python3 - <<'EOF'
import json
pages = ["/path/page1.txt", "/path/page2.txt"]   # every saved response, in order
out = {"vacancies": [], "pages": len(pages)}
for p in pages:
    out["vacancies"] += json.load(open(p))["vacancies"]
json.dump(out, open("/tmp/onetap.json", "w"))
print(len(out["vacancies"]), "vacancies from", len(pages), "pages")
EOF
```

The last page's `nextCursor` must be empty; if the last file you merged still
has one, a page is missing. Report the real count ("190 new over 2 pages"),
never the `total`.

**LinkedIn.** No login, no cookies — `sources/linkedin.py` uses LinkedIn's
public `jobs-guest` endpoints. (Only the *writes* in step 5 need a session.)

```bash
python3 $S/triage.py collect --source linkedin --max-age-days 7 --workers 2 -o /tmp/linkedin.json
```

That runs search and fetch **interleaved**: each query's new postings are
fetched as soon as that query is searched. `--workers` is the answer from
step 0 (default 1, capped at 4). It parallelises the description fetches only;
the search itself stays one request at a time.

**A run can be stopped at any point and loses nothing.** A full 14-day sweep
was 4283 postings, ~3800 new, on 2026-09-11 — an hour or more — so this is
built in, not an afterthought:

- `/tmp/linkedin.json` is rewritten after every query and every 25
  descriptions. At any moment it is a valid snapshot of complete, judgeable
  records: `"complete"`, `queries_done`/`queries_total`, `queries_pending` and
  `not_yet_fetched` say how far it got. `batch` it and start judging while the
  rest is still coming in.
- `/tmp/linkedin.json.run/` is the checkpoint: `state.json` after every search
  page, `jobs.jsonl` a line per description.
- **Ctrl-C / SIGTERM** (`kill -INT <pid>`, or stopping the background task)
  finishes the requests in flight, writes the snapshot with
  `"complete": false` and exits **130** — not a failure. A second Ctrl-C
  aborts at once; even a `kill -9` loses only the request in flight.
- **The same command again resumes**: finished queries are not searched again,
  fetched postings are not fetched again. It refuses a checkpoint started with
  different flags; `--fresh` discards one.
- Postings judged into the ledger off an earlier snapshot are left out of the
  output on resume (`judged_since_snapshot` counts them), so nothing is judged
  twice.

Progress streams live on stderr, the JSON summary goes to stdout — a line per
page, a summary per query (`[7/21] … done: 68 postings, 12 new | so far 340
seen, 120 new, 118 fetched | 9m14s | snapshot -> …`), and per description a
percentage, the unreadable count and an ETA. Run it in the background with
stderr sent to a log (`2> collect.log`) and `tail` that to report progress.
The search has no ETA: a query's page count is unknown until it runs dry.

**A narrow ad-hoc ask ("published since Saturday") wants `--since-days`, not
`--max-age-days`.** `--max-age-days` only drops cards *after* the full
configured window (14 days by default) has already been paged through and
every new description fetched — the request volume is unchanged, only what
survives client-side filtering shrinks. `--since-days N` instead overrides
`f_TPR` itself with an exact `r<seconds>` value, which LinkedIn's search
actually respects (confirmed live 2026-09-15 — see `filters.json`), so the
narrower window is applied at the source: fewer cards paged, fewer
descriptions fetched, a much shorter run. Learned the hard way on 2026-09-15:
a "since Saturday" request was run with the default 14-day window and
`--max-age-days 2`, taking ~45 minutes for a ~2-day ask.

```bash
python3 $S/triage.py collect --source linkedin --since-days 2.5 --workers 2 -o /tmp/linkedin.json
```

The two halves also exist separately, when you want to inspect the search
before spending the fetches. They are neither checkpointed nor resumable —
prefer `collect` for a real run:

```bash
python3 $S/sources/linkedin.py search --max-age-days 7 > /tmp/li-search.json
python3 $S/sources/linkedin.py fetch --from-search /tmp/li-search.json --workers 2 > /tmp/linkedin.json
```

`search` drops everything already in the ledger, and deduplicates across matrix
cells — a posting found by three queries is one record, with `found_by` naming
all three. Narrow a run with `--location`, `--keyword` or `--query`, and check
the cost first with `--dry-run`.

**One LinkedIn run is not complete coverage.** The guest endpoint serves a
shifting sample, not a stable ordered list: two runs of the same query seconds
apart returned 19 and 17 cards with 9 postings the first never showed. A
posting can surface days after it went up. Run daily rather than weekly, and
trust `posted_at` over position.

### 2. Batch

```bash
python3 $S/triage.py batch --onetap /tmp/onetap.json --linkedin /tmp/linkedin.json -o /tmp/batch.json
```

This normalises both shapes into one record type. That is all it does:
everything that came back is judged, including postings that look like each
other.

**Duplicates are not resolved here** — step 3 does that, on the evidence of the
full descriptions this step has just assembled.

### 3. Cluster the duplicates

```bash
C=.claude/skills/applications-check
python3 $C/check.py cluster --batch /tmp/batch.json -o /tmp/batch.clustered.json
```

Roughly 10% of a batch is the same job twice. The aggregators return one
posting from Just Join IT, from Indeed and from the employer's own feed, and
none of the copies is in the pipeline yet, so nothing later catches them.

Judge `items` from the **clustered** file from here on. Each is the copy of its
job that carries the most information — measured, not assumed: of the real Company D
pair, only the Just Join IT copy stated the rate, and it won on that. The
primary absorbs what the others knew, and anything they disagreed about is
attached as `duplicates_disagree_on` for Gates 3 and 4 to see.

Nothing is discarded. A collapsed copy inherits its primary's verdict in step 7
and is written back to its own source, which is what stops the feed serving it
again.

Two buckets are deliberately **not** merged, and both need you rather than the
script:

- `suspected_duplicates` — same company, close but not conclusive. Judge them
  all, read them as a set, and if the gates land differently on two of them say
  why in the notes.
- `same_job_different_company` — two agencies advertising one end client's role.
  **Ask the candidate** which to go through; applying via both can sink both.
  Judge them separately until they answer.

Both are computed **before** any verdict exists, since clustering has to run
before judging to save the reads the merge tier above collapses. Neither band
merges anything, though — every member is still read and judged individually —
so what `cluster` reports here is raw and pre-verdict. On a real batch ~95%
ends up `NOT_INTERESTED`, and most of these groups turn out to be entirely
that: asking which agency to apply through, or flagging a "read as a set" note,
is moot for a job nobody wants. Step 7's `match` re-filters both bands once
every member has a verdict — report `suspected_duplicates_live` and
`same_job_different_company_live` from there, not the raw counts from here.

The full method, the measured thresholds and the reporting duties are in the
`applications-check` skill.

### 4. Read every description

This is the single most important step, and the one every wrong verdict has
failed. Work through `items` in the clustered batch and read `description` in full.

**Never judge from the title — or from `keywords`, or from any source's tags.**
On the calibration day, two roles with perfect titles hid Angular and Java in
the body. All seven wrong verdicts in the 2026-09-04 re-audit failed this way.
See Gate 0 in `gates.md`.

Per-source traps, all the same trap:

- **onetap `keywords`** are populated by the aggregator and routinely overstate
  a technology the body demotes to "podstawy" or drops entirely.
- **LinkedIn workplace tags** are unreliable — the `f_WT=2` "remote" filter
  returns plenty of on-site roles. Gate 3 reads the location
  out of the body. A posting tagged with a city whose body opens "Location: Remote"
  is remote.
- **LinkedIn seniority tags** are unreliable — `Not Applicable` is common and
  genuine senior roles are tagged `Associate`. Gate 6 reads the stated years out
  of the body.
- **LinkedIn salary** is absent from the guest view, so `salary` is null and
  `salary_hints` carries the money-looking lines from the description instead —
  often a day rate (`400–500 EUR/day` ≈ 8.4–10.5k EUR/month at ~21 working days).
  Normalise per Gate 4. A posting with no salary is not rejected on that basis.

Items marked `unreadable` were pulled or closed between search and fetch. Give
them verdict `UNREADABLE` so they stop coming back; never guess from the card.

### 5. Apply the gates

Gates 1–6 from `gates.md`, with the candidate's numbers from `criteria.md`, in order. The first failure ends the evaluation
and names the reason. While reading, hold on to the specific line that decides
it — the note needs it.

When a gate genuinely cannot be settled from the posting — `criteria.md` names
places it cannot settle, in its Location section, as exactly this — use verdict `UNDECIDED` with a
`question`. Undecided items are written nowhere, so they resurface on the next
run once the candidate has answered. Do not guess and do not silently reject.

#### Judging in parallel

When step 0 chose agents, split the clustered batch and hand the files out:

```bash
python3 $S/triage.py chunk --batch /tmp/batch.clustered.json --agents 5 -o /tmp/chunks
```

That writes `chunk_000.txt`… of 15 postings each, rendered the way a judge
should read them — description in full, no aggregator keywords — and
`manifest.json`, which assigns the files to the agents, biggest first to the
least loaded so they finish together.

Spawn every agent in **one** message (Agent tool, `general-purpose`), one per
entry of `manifest.json` → `agents`, each with this brief:

> Read `.claude/skills/job-triage/gates.md` and `data/criteria.md` in full
> first — together they decide every verdict. Then read each of these files in full: <its chunks>, in <dir>. For
> each `chunk_NNN.txt` write `v_NNN.json` beside it: a JSON array, one object
> per posting, in the shape of step 6 of `.claude/skills/job-triage/SKILL.md` —
> `ref`, `verdict` (`SAVED`, `NOT_INTERESTED`, `UNDECIDED` with a `question`,
> or `UNREADABLE`), `reason`, and for a save `keywords`, `workplaceType`,
> `experienceLevels`, `employmentTypes`. Apply Gates 1–6 in order; the first
> failure names the reason. Never judge from the title — read the
> requirements. Every rejection quotes the line that decides it, copied
> verbatim from the posting in its own language. When a gate cannot be settled
> from the text, use `UNDECIDED` with the question; never guess. Write only
> those files — no other changes, no MCP calls. Reply with the counts per
> verdict.

Then merge and check what came back:

```bash
python3 $S/triage.py merge --batch /tmp/batch.clustered.json --dir /tmp/chunks -o /tmp/verdicts.json
```

It **refuses** to write on a structural gap — a posting with no verdict, one
judged twice, a ref not in the batch, a save or rejection without a reason, an
`UNDECIDED` without a question. Re-run the agent on that chunk. It **warns**,
under `recheck`, about every rejection with no quote or with a quote that is
not in the posting — diacritics, dashes and case are folded first, so
text typed without diacritics still matches. Such a reason was paraphrased or invented:
re-read each of those postings yourself.

Then, before step 7, read these in full yourself, whatever the agents said:
every `SAVED`, every `UNDECIDED`, and every `recheck`. The agents settle the
rejections; the keepers and the questions are what the candidate acts on, and
there are few of them.

### 6. Write the verdicts

One verdicts file for the whole batch, whatever the source. It is not routed as
it stands — step 6 checks the keepers first and produces the file that is:

```json
[
 {"ref": "onetap:cmtsy...", "verdict": "NOT_INTERESTED",
  "reason": "Gate 1 - Framework X is the frontend: 'quoted requirement'. Team is 3 Framework X devs."},
 {"ref": "linkedin:4438943404", "verdict": "SAVED",
  "reason": "Node.js/TS backend, fully remote, 4+ years. No salary posted - ask the rate.",
  "keywords": ["Node.js","TypeScript","AWS"], "workplaceType": ["REMOTE"],
  "experienceLevels": ["SENIOR"], "employmentTypes": ["FULL_TIME"]},
 {"ref": "linkedin:4464096634", "verdict": "UNDECIDED",
  "question": "Company H, City X, perfect stack. The Location section lists City X as unresolved — accept or reject?"}
]
```

### 7. Check the keepers against the pipeline

Before anything is written, every `SAVED` verdict is checked against onetap's
application pipeline: a job already saved, applied to, or rejected earlier must
not enter it a second time.

Use the **`applications-check` skill** — `.claude/skills/applications-check/`.
It reads this verdicts file, asks `get_my_applications` one query per company,
flips whatever is already tracked to `NOT_INTERESTED` with a note naming what
it duplicates, and writes `/tmp/verdicts.checked.json`. The same pass expands
step 3's clusters, so every collapsed copy leaves with a verdict of its own.

It also re-filters step 3's `suspected_duplicates` and
`same_job_different_company`, now that every member has a final verdict:
`suspected_duplicates_live` and `same_job_different_company_live` keep only
the groups with a surviving member, dropping the ones that turned out
entirely `NOT_INTERESTED`. Report from these, not from step 3's raw counts.

The match reads descriptions, not just titles, because re-listed jobs come back
under new titles. If it stops and lists tracked records with no readable
description, fetch them with `get_vacancy` and re-run with `--descriptions`.
A keeper that looks like a tracked record without being provably the same comes
back `UNDECIDED` under `ask_candidate`. Ask the candidate before routing.

Report every flip to the candidate. A keeper dropped silently is
indistinguishable from a keeper that never existed.

### 8. Route the verdicts

Route the **checked** file, not the raw one:

```bash
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json
```

That prints the exact arguments for each call:

- `onetap_bulk_update_applications` → one `bulk_update_applications` call, up to
  50 items. Never loop `update_application_status` over a page.
- `linkedin_create_custom_vacancy` → one `create_custom_vacancy` per entry.
- `linkedin_actions` → the save/dismiss calls to make on LinkedIn itself,
  sent by `--apply-linkedin` (next section).
- `undecided` → report these to the user as questions.

For a LinkedIn save, add to the verdict whatever the posting states —
`keywords`, `workplaceType`, `experienceLevels`, `employmentTypes`, `salary`,
`publishedAt`, and `cityIds` / `countryIds` / `categoryIds` sourced from
`get_my_filters` or `list_cities`. **Never guess an id.** A bare record is not
worth keeping months later. Title, company, link and description are filled in
from the batch by `route` — into the JSON, not into the call. You carry each
entry into `create_custom_vacancy` yourself, so copy `description` **verbatim**:
never summarise, trim or paraphrase it. The onetap record is the only copy the
candidate keeps once the LinkedIn posting expires, and it is what a tailored CV
is written from. On 2026-09-19 all 19 keepers went in as ~700-character
summaries headed "Summary of the posting (full text at the source link)" and had
to be restored by hand. If the budget will not stretch to the full texts, stop
and say so — do not shorten them to fit.

`link` is unique per user. A repeat answers `VACANCY_LINK_ALREADY_EXISTS` with
`payload.existingVacancyId` — never retry the create, call
`update_custom_vacancy` on that id instead.

#### Act on LinkedIn itself

`--apply-linkedin` bookmarks every `SAVED` job on LinkedIn itself. It leaves
the rejections alone:

```bash
# see the calls first — these are writes on a real account
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json \
        --apply-linkedin --dry-run

# keepers bookmarked, rejections untouched
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json --apply-linkedin
```

A verdict that only lives in this repo leaves the candidate's own LinkedIn feed
full of jobs already rejected, and `--dismiss-rejections` is what closes that
loop. **Never pass it unasked** — it is one write per rejection, and step 0's
third question is where the candidate answers. `route` reports how many were
held back as `linkedin_dismissals_withheld`, so the offer stays visible:

```bash
# only on an explicit yes
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json \
        --apply-linkedin --dismiss-rejections
```

This is the one part of the LinkedIn source that needs a **login**. Set the
session up once:

```bash
python3 $S/sources/linkedin_actions.py check     # says who you are, changes nothing
```

If that fails, write `linkedin/session.json` (gitignored) from DevTools →
Application → Cookies on `linkedin.com` while logged in:

```json
{"li_at": "<li_at cookie>", "jsessionid": "ajax:<digits>"}
```

Both cookies are needed — `JSESSIONID` *is* the csrf token, so a session with
only `li_at` gets a 403. `$LINKEDIN_COOKIE` holding a whole `Cookie:` header
works too and wins over the file.

Single jobs, outside a triage run:

```bash
A=$S/sources/linkedin_actions.py
python3 $A dismiss 4443605886 4455410901   # "not interested", hides them from search
python3 $A undo-dismiss 4443605886         # the undo, when a verdict was wrong
python3 $A save 4455784336
python3 $A unsave 4455784336
```

**`undo-dismiss` is the repair tool.** When the candidate corrects a rejection,
undo the dismissal as well as fixing `criteria.md` and the ledger — otherwise
the job stays hidden on LinkedIn and the correction is invisible where it
matters.

Failures do not stop the run: each call is reported and the ones LinkedIn
accepted are stamped onto the ledger record as `linkedin_action`, so a failed
dismiss stays visible instead of looking done.

#### Then the ledger

Once the writes have gone through, commit the LinkedIn verdicts to the ledger:

```bash
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json \
        --apply-linkedin --write-ledger
```

Do this last, and always — it is what makes the next run cheap. Rejections are
recorded in the ledger and deliberately **not** pushed to onetap: several
hundred rejections a week would cost a create call each and bury the real
applications. Unless the candidate asked for the dismissals, the ledger is
their **only** record, which is exactly why this step is not optional.

### 9. Notes discipline

Every status change gets a note in English naming the gate and quoting the
disqualifying line. Skipping this is expensive: 235 of the 245 September
rejections had no note, so all of them had to be re-read from scratch to audit
the batch.

```
Gate 1 — Angular is the frontend: "Współtworzenie frontendu w Angular,
w zależności od potrzeb projektu". Team is 3 Angular devs.
```

For a save that carries a caveat, say so — the caveat is what makes the
shortlist useful later:

```
Saved. TS/React/Node core, remote, 26.9-30.2k. Caveat: Kubernetes and Neo4j
in the stack, 12-month contract.
```

### 10. Report

- how many were seen, how many were new, saved, rejected, per source
- for LinkedIn, how many were bookmarked on the site itself, how many
  dismissals were sent or withheld (the default), and any call that failed
- how many copies were collapsed in the batch, and which copy was kept
- how many keepers were already in the pipeline, what each one duplicates, and
  the status it is tracked under — never drop one silently
- every cross-company pair still live after verdicts
  (`same_job_different_company_live` from step 7), as a question the
  candidate has to settle — most cross-company pairs turn out entirely
  rejected and are not worth asking about
- every suspected-duplicate group still live after verdicts
  (`suspected_duplicates_live` from step 7)
- the saved ones as a list, each with company, title, salary, work model, and
  the **onetap** link — never the original job board or LinkedIn URL
- every `UNDECIDED` item with the question you want answered
- anything unreadable, and any source that failed outright

### When the candidate corrects a verdict

Update `criteria.md` so the correction survives the session. That file is the
memory of this whole system; a correction that lives only in the conversation
is lost.

For a LinkedIn job, undo the action too, or the correction never reaches the
site: `linkedin_actions.py undo-dismiss <job_id>` for a wrongly rejected one,
`unsave` for a wrongly saved one. Then re-record the verdict so the ledger
agrees.

## Adding a source

`triage.py` is the only place that knows about source shapes. A new source
needs a `normalise_*` function producing the unified record, a branch in
`route` for its write call, and its own "already judged" mechanism. Nothing
about the judgement changes.

Keep reading and writing in separate modules the way LinkedIn does —
`linkedin.py` needs no credentials and `linkedin_actions.py` needs a live
session, and a collection run should never be able to fail on an expired
login.

## When LinkedIn breaks

Undocumented HTML endpoints, changed without notice.

- **`search` returns zero cards for every query** — the search HTML changed, or
  the IP is throttled. Check by hand:
  `curl -A "Mozilla/5.0" "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=React&location=Germany&start=0" | head -50`
- **`fetch` returns `ok: false` for everything** — the description selector
  changed (`show-more-less-html__markup`) or the guest view went behind an auth
  wall. Re-derive the selector from live HTML before touching anything else.
- **Sustained HTTP 429** — the script backs off and retries four times. Beyond
  that, stop the collect (Ctrl-C) and come back later: the same command resumes
  from the checkpoint. Leave the ledger unwritten so nothing is lost.
- **`--apply-linkedin` exits on 401/403/999** — the session died. `li_at`
  expires and `JSESSIONID` rotates on every logout, so re-copy both cookies.
  Judgements are unaffected: re-run `route` once the session is back.
- **A save or dismiss answers an unexpected status** — the Voyager endpoints are
  undocumented and versioned by nobody. Re-capture them from DevTools (filter on
  `voyagerJobsDashJobPostingRelevanceFeedback` and `voyagerFeedDashSaveStates`)
  rather than guessing at a new shape.

Report a breakage as a breakage, and carry on with onetap. Never fall back to
judging from search-card titles because the descriptions would not load.
