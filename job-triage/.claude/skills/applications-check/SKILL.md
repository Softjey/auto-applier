---
name: applications-check
description: Find out whether a vacancy is already known — either duplicated inside the current batch, or already in the candidate's onetap pipeline. Collapses the copies of one job that the aggregators return from several boards, keeping the copy with the most information; flips keepers that are already saved, applied to or rejected into NOT_INTERESTED; and raises the ambiguous cases as questions instead of guessing. Use during a triage run, before judging and again before verdicts are written; on its own to answer whether a specific job is already in the pipeline; or to sweep the pipeline itself (SAVED and APPLIED) for jobs it is holding twice.
---

# Applications check

Two different questions, one answer each run: **is this job already in the
batch twice, and is it already in the pipeline?** The same clustering answers a
third, on demand: **is the pipeline holding one job twice?** — a keeper saved
again a month after it was applied to, or one posting applied to twice through
two spellings of an agency.

Neither is a matter of taste. Both have a right answer, and both are cheap to
get wrong in the same expensive way — a vacancy collapsed into another one is
a vacancy the candidate never learns existed. So the rule throughout is:

> Merge what the evidence settles. Report what it does not. Never drop
> anything in silence.

Nothing here is ever deleted. A duplicate keeps its ref, inherits the verdict
of the copy that was judged, and is written back to its own source so the feed
stops serving it.

```
batch    -> cluster -> judge the primaries -> queries -> get_my_applications
         -> match -> route
pipeline -> cluster -> report
```

`cluster` is the whole engine and it does not care where the records came
from — a fresh batch off the boards and the candidate's own applications are
the same shape, so the difference between the two runs is only which command
builds the batch.

---

## Part 1 — duplicates inside the batch

The aggregators are the reason this exists. One posting arrives from Just Join
IT, from Indeed and from the employer's own feed. None of the three is in the
pipeline yet, so the pipeline half cannot catch them — and reading three copies
of one job costs three reads and produces three pipeline entries.

```bash
C=.claude/skills/applications-check
python3 $C/check.py cluster --batch /tmp/batch.json -o /tmp/batch.clustered.json
```

Run it **after `triage.py batch` and before judging**, and judge
`items` from the clustered file.

### What counts as the same job

Measured on 50 live onetap records, 2026-09-10. The metric is word 3-shingle
**containment** — the shared shingles over the *shorter* description, so a
board that publishes a truncated teaser of the same posting still scores high.

| | containment |
|---|---|
| Company A / Company A Ltd, `Senior Frontend Engineer` | **1.000** |
| Company B, `SWE Manager, GCE` — Indeed vs employer feed | **0.990** |
| Company Q, `Angular Developer` — Indeed vs Just Join IT | **0.929** |
| Company D / Company D Ltd, `Software Engineer` — Indeed vs JJIT | **0.926** |
| — | |
| Company C, `Senior Full Stack Developer (Angular & Node.js)` ×2 | 0.595 |
| Company C, `Senior Full-stack (PostgreSQL)` vs `(Python)` | 0.578 |
| Company B, `Senior SWE App Hub` vs `SWE Manager GCE` | 0.516 |
| Company C, `Lead Java` vs `Senior Full Stack Angular` | 0.376 |
| P&P Solutions, `Full Stack` vs `Senior Fullstack` | 0.003 |

Two things follow, and both contradict the obvious rule:

**A shared title does not make one job.** Company C posted *Senior Full Stack
Developer (Angular & Node.js)* twice on one day with the description rewritten
in different words — 0.595. It may well be two openings.

**A high score does not make one job either, below a point.** Company C's
boilerplate alone carries two genuinely different roles to 0.578.

So the auto-merge line sits at **0.85**, clear of every observed different-job
pair, and the band beneath it is reported rather than merged. A merge also
requires the same normalised company (`Company E Ltd` = `Company E`, `Company D Ltd` =
`Company D`) and no seniority conflict — `Junior` and `Senior` at one company are two
jobs whatever the text shares. An identical link merges on sight; a posting
with no description at all (a LinkedIn 404) merges on company plus title,
since it carries nothing the other copy lacks.

### Which copy survives, and what it inherits

The primary is the copy that tells the judge the most, scored on what it
actually carries: salary 40 (Gate 4 turns on it and most postings omit it),
description length up to 30, location 8, workplace 8, experience 8, employment
5, keywords up to 8, published 4, and 3 for being an onetap record — a
tiebreak only, but it carries the application status and the onetap link, which
is the only URL the candidate may be given.

The real Company D pair shows why this matters: both boards had the same job, and only
the Just Join IT copy stated `130–140 PLN/h`. It won 109 to 53.

The primary then absorbs the rest:

- **blank fields are filled** from the other copies (`enriched_from` says which)
- **keyword and salary-hint lists are pooled** — more tags are strictly more
- **fields the copies dispute** are reported on the record as
  `duplicates_disagree_on`, never resolved. One board saying Remote and another
  city is exactly what Gate 3 needs to see.
- descriptions are never merged. The judge reads one posting, not a collage.

### The two things it refuses to decide

**`suspected_duplicates`** — same company, too close to ignore, not close
enough to merge. Reported as one group per company, not one row per pair:
Company C's five spun postings are nine pairs and one useful line. Judge them all,
and read them as a set — if the gates land differently on two of them, say why
in the notes.

**`same_job_different_company`** — the agency case. Two agencies advertise one
end client's role under their own names, so the company names never match and
the text nearly does.

One spelling is resolved before this fires: an abbreviation against the full
name, when both are in the batch and exactly one full name claims the initials.
`ACG` and `Acme Consulting Group` are one agency, and the pipeline held the
same posting under both — 0.990 on an identical title, applied to twice a day
apart — while reading as two agencies on one end client. The initials come from
the cleaned name, not the company key, because the key strips the `Group` that
the abbreviation keeps. An acronym two companies in the batch could answer to is
left alone. Across 1196 cross-company pairs in the sample the
containment never exceeded 0.060, so anything above **0.35** is extraordinary
and is flagged.

These are **never merged, and never decided by this skill.** Which agency to go
through is the candidate's call, and applying to one end client through two of
them can sink both applications. **Ask the candidate**, quote both companies
and both links, and judge the postings separately until they answer. If they
settle it as a general rule, that rule belongs in `criteria.md`.

### Neither band is worth reporting before the verdicts are in

`suspected_duplicates` and `same_job_different_company` are computed here,
before anything is judged — clustering has to run before judging so the
**merge** tier can save the reads it exists to save (see AUTO_MERGE above).
But neither of these two bands merges anything: every member stays a separate
`item`, gets read, and gets judged on its own regardless of which band it is
in. So reporting them at cluster time reports groups whose fate nobody knows
yet, and on a real run ~95% of any batch ends up `NOT_INTERESTED` — most
suspected-duplicate groups and most cross-company pairs turn out to be about
jobs nobody wants either way. "Which agency should I apply through" for a
role both listings of which were rejected is not a question worth asking.

So `cluster`'s counts here are raw and pre-verdict — read them as "found",
not "to review". The report the candidate actually sees comes from `match`
below, once every member has a final verdict: it filters both bands down to
`suspected_duplicates_live` / `same_job_different_company_live`, keeping a
group only if at least one member is not `NOT_INTERESTED` (a ref with no
verdict at all counts as live too — never drop a group on missing
information). Verified on synthetic mixed-verdict groups: an all-rejected
group is dropped, a group with one `SAVED` or `UNDECIDED` survives, and a
group with a ref missing its verdict survives. On the ledger's 467 already-
judged records (no descriptions, so only the exact-title fallback merges —
86 collapsed, 0 suspected/cross-company pairs found, since the containment
bands need descriptions to compare) the mechanism runs end to end with no
regressions; measuring the actual reduction in suspected/cross-company counts
needs a fresh batch with descriptions, since the raw batch from the
2026-09-12 run (225 suspected groups, 288 cross-company pairs) was not kept.

---

## Part 2 — is it already in the pipeline?

A keeper is not finished when it passes the gates. It still has to be new: the
candidate may have saved this job last week from the other source, applied to
it a month ago, or rejected it in an earlier batch.

### 1. Ask what to check

```bash
python3 $C/check.py queries --verdicts /tmp/verdicts.json --batch /tmp/batch.clustered.json
```

Only `SAVED` verdicts are checked — a rejection is already out, and an
`UNDECIDED` is written nowhere, so neither can be made worse by a duplicate.
Source makes no difference: an onetap keeper and a LinkedIn keeper are checked
the same way, against the same pipeline.

The output names one query per company, collapsed across sources and spellings
— LinkedIn's `Company E` and onetap's `Company E Ltd` are one call.

### 2. Run those queries

For each, call `get_my_applications` with `query: "<query>"` and `limit: 100`.
Pass **no** `status` filter: a job rejected in September is exactly what this
is looking for, and so is one already applied to.

There are **6000+ applications** on the account, 5700 of them
`NOT_INTERESTED`, so dumping them is not an option — the free-text query is
what makes this cheap. It searches title, company name **and** notes, so it
over-returns; step 3 is what makes it precise.

Save every response into one JSON object keyed by the query string:

```json
{ "Company E": { "total": 63, "applications": [ ... ] } }
```

If a response's `total` exceeds the number of `applications` it returned, the
pool is truncated and a match can be missed. `match` warns about it — re-run
that query with the distinctive words of the title added.

### 3. Match

```bash
python3 $C/check.py match --verdicts /tmp/verdicts.json --batch /tmp/batch.clustered.json \
        --candidates /tmp/candidates.json [--descriptions /tmp/descriptions.json] \
        -o /tmp/verdicts.checked.json
```

This does three things. First it **expands the clusters**: every duplicate
collapsed in part 1 inherits its primary's verdict as `NOT_INTERESTED`, so it
is dismissed on its own source and stops coming back. A duplicate is
`NOT_INTERESTED` even when its primary is saved — one job belongs in the
pipeline once.

Second, now that every member of a `suspected_duplicates` group or a
`same_job_different_company` pair has a final verdict, it **filters both
bands** down to the groups actually worth reporting — see above. The result
carries `suspected_duplicates_total` / `_live` and
`same_job_different_company_total` / `_live`; report the `_live` lists to the
candidate, not the raw ones from `cluster`.

Then it matches the keepers against the pipeline, strongest evidence first:

| Matched on | Outcome |
|---|---|
| `link` | flipped — the same URL is already tracked |
| `linkedin job id` | flipped — the id appears in a tracked vacancy's link or notes |
| `description` ≥ 0.85 containment, same company, no seniority conflict | flipped — whatever the titles say |
| title similarity ≥ 0.70 and description ≥ 0.30, or an identical title with descriptions that disagree | **`UNDECIDED`** with a question naming the tracked record |
| `company + title`, only when a description is missing on either side | flipped |

**Titles alone never settle it.** Until 2026-09-16 the last row was the only
resemblance check, and two keepers already applied to were saved again: iTeamly
re-posted a role word for word under a new title (1.00 on the descriptions), and
Company J's August posting came back from LinkedIn as "Frontend Game Developer"
instead of "Frontend/Games Developer", rewritten (0.49). The 0.85 line is part 1's.
The ask band is measured on the 2026-09-13 batch: description alone is useless
there, since 26% of 1679 different-job pairs in one company clear 0.50 on
boilerplate, but title ≥ 0.70 together with description ≥ 0.30 leaves 16 of them
(1%) and still holds both misses. Translations are out of scope: a German and an
English copy share no shingles.

So `match` needs a description for every tracked record of a keeper's company.
It reads the onetap page (cached under `--cache`), and for a custom vacancy, which
has no public page, it reads LinkedIn's guest endpoint by the job id found in the
notes or in `linkedin/ledger.json`. Anything still blank stops the run with
the ids listed. **Do not work around that.** Read each one with `get_vacancy` and
pass `--descriptions '{"<vacancy id>": "<descriptionText>"}'`. An empty string
is accepted for a posting that genuinely has none, and it falls back to the title rules.

An `UNDECIDED` from this step is listed under `ask_candidate` and is written
nowhere by `route`. Put the question to the candidate. On "same job", set it
`NOT_INTERESTED` with the duplicate note below; on "different job", restore
`SAVED`.

Each flip gets a note naming what it duplicates, its status, and the
fact that it *passed* the gates:

```
Duplicate - already in the pipeline as APPLIED since 2026-09-01: Jit Team /
Senior Frontend Developer - https://onetap.work/job/senior-fe-cmtjit1/.
Matched on company + title. Passed the gates on its own merits (...), so this
is a duplicate rather than a rejection.
```

That wording matters. A future audit reading `NOT_INTERESTED` must be able to
tell a duplicate from a rejection on the merits, or the role looks twice
rejected.

---

## Part 3 — is the pipeline holding one job twice?

Parts 1 and 2 both look outward: they protect a fresh batch from the pipeline
and from itself. Neither looks at the pipeline on its own, and it drifts —
a job applied to in August is saved again in September off another board, or
one agency's posting is applied to twice under two spellings of its name.

```bash
C=.claude/skills/applications-check
python3 $C/check.py pipeline --applications /tmp/saved.json /tmp/applied.json \
        -o /tmp/pipeline.json
python3 $C/check.py cluster --batch /tmp/pipeline.json -o /tmp/pipeline.clustered.json
```

`--applications` takes saved `get_my_applications` answers, one file per
status. `SAVED` and `APPLIED` are the pair worth checking — they are the live
pipeline, and small (164 records on 2026-09-13, against 5730+ `NOT_INTERESTED`).
Add `REJECTED` when the question is whether a re-listing is worth a second try.

**Page every status file to its own `total` before saving it.** `get_my_applications`
caps at `limit=100` per call; a pipeline this size already exceeds that on the `SAVED`
side alone. On 2026-09-13 a duplicate check was run against a `SAVED` file that only
held the first 100 of 148 records — the two duplicates sitting on page 2 (Company V,
Company E/Company E Ltd re-saved days apart) were invisible to the tool and only surfaced by a
manual re-read. `pipeline` now refuses a file whose `total` doesn't match its record
count, but the fix is to fetch every page (`page=1,2,...` until `total` records are
collected) and merge them into one JSON file before calling `pipeline` — the guard
only stops the silent miss, it doesn't collect the missing pages for you.

**Where the descriptions come from.** `get_my_applications` returns a vacancy
*summary*, and clustering is decided on descriptions; re-reading 85 of them
through `get_vacancy` would spend exactly the context the free-text query in
part 2 exists to save. So the command reads each one off its public onetap
page, where an indexed posting carries a `schema.org/JobPosting` block, and
caches the pages under `--cache`.

A vacancy the candidate created themselves (`create_custom_vacancy`) has no
public page and so no block. Those are **named in the output**, never guessed
at — a record with no description merges only on an identical title, which is
the one rule the Company C measurement says is wrong. Read them with `get_vacancy`
and hand them back:

```bash
python3 $C/check.py pipeline --applications ... \
        --descriptions '/tmp/custom.json'   # {"<vacancy id>": "description"}
```

**Nothing is written back.** Part 2 flips a fresh keeper because the candidate
has not seen it yet; a status in the pipeline is one they set themselves, and
changing it is their call. Report, recommend, and let them answer. What the
report should say, per pair:

- which record is the one to keep — the earlier `APPLIED` over a later `SAVED`,
  because the application is the fact and the save is the accident
- the containment, and what the descriptions actually differ on. A pair merging
  at 0.99 on *different titles* is worth a sentence: Company I's `Node.js Developer`
  and `Senior Backend Engineering, Content Creation` shared everything but one
  line, which is either one posting re-listed or one template on two teams
- for two `APPLIED` records, that there is nothing to withdraw. The second
  application is already sent; `ARCHIVED` on the later one keeps the pipeline
  honest and names where to track the reply

Then apply what they agree to with `update_application_status`, one note each,
naming the record it duplicates and the containment — an audit reading
`NOT_INTERESTED` has to be able to tell a duplicate from a rejection.

---

## Reporting — not optional

Every collapse and every flip is reported to the candidate. A keeper dropped
silently is indistinguishable from a keeper that never existed.

- **collapsed in the batch**: the company, the title, how many copies, which
  one was kept and what it gained (`enriched_from`)
- **disputed fields**: where two copies disagreed on salary, location or
  workplace
- **already in the pipeline**: company, title, the existing status, and the
  onetap link of the record it duplicates
- **suspected duplicates**: `suspected_duplicates_live` from `match` — what
  was judged separately and why, for the groups that still have a surviving
  verdict. An all-`NOT_INTERESTED` group is not reported; it was judged
  separately same as any other group, it just has nothing left to ask about.
- **cross-company pairs**: `same_job_different_company_live` from `match`, as
  a question, with both links — same filter, same reason.

Two cases deserve calling out rather than listing:

- the existing record is `NOT_INTERESTED` while the fresh posting **passed**
  the gates. Either the earlier verdict was wrong, or they are different roles
  sharing a title. Say so, and offer to re-open it.
- the existing record is `APPLIED`, `INTERVIEW` or later. The candidate is in
  that process already; the duplicate usually means the role was re-listed.

## Then route

Hand `route` the **checked** verdicts, never the raw ones:

```bash
python3 $S/triage.py route /tmp/verdicts.checked.json --batch /tmp/batch.clustered.json \
        --apply-linkedin --write-ledger
```

## When the candidate overrules

A collapse or a flip is a duplicate call, not a judgement, so nothing goes into
`criteria.md` — except an agency rule, which is a policy and does belong there.
Restore the record instead:

- on onetap, `update_application_status` back to `SAVED` with a note saying why
  it is not a duplicate
- on LinkedIn, `sources/linkedin_actions.py undo-dismiss <job_id>` and re-record
  the ledger verdict, or the correction never reaches the site

If the same pair is wrongly matched twice, the fix belongs in `check.py` — a
threshold, or a word that should not have been stripped. Re-measure before
moving a threshold; the numbers above are what they are because they were
measured, not chosen.
