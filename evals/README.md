# Agent evals

The tests check the scripts; the evals here check the **agent**: a real Claude run of the
skills, in a sandbox, against a fictional candidate and a mocked OneTap.Work. They run with
`claude plugin eval`, cost real usage, and are not part of CI.

## What is checked

### Triage

| Case | What it checks |
| --- | --- |
| `job-triage-onetap-rules-a`, `-rules-b` | clear-cut rejections by the rules (stack, role, salary below the floor, more than 7 years, German required, the current employer) and a Kraków hybrid save |
| `job-triage-onetap-duplicates` | copies of one job in the batch, two agencies with one role, jobs already in the pipeline (matched by LinkedIn ID, or by company and title) |
| `job-triage-onetap-borderline` | forward-deployed and platform roles go to the candidate as questions and are never written |

Every triage case also checks that the skill fired, that verdicts were written, that nothing
was written with a placeholder note, and that the agent never calls the data a test.

### Resume

| Case | What it checks |
| --- | --- |
| `resume-blocks-sigma-frontend-react` | a role on the core stack: the Title mirrors the vacancy, the Summary is 40–75 words with no first person |
| `resume-blocks-alten-fullstack-cloud` | Java, Azure and Kubernetes (rated 0–1) stay out of the Skills block while GCP, Docker and Node.js cover the categories; the Title drops the tech; the years count skips the pre-career support job (`6+ years`) |
| `resume-blocks-apollo-8-years` | the posting asks for more years than the CV has: the Summary says nothing about years and the gap is reported |
| `resume-blocks-ink-fintech` | a crypto/fintech employer: the industry is not claimed, the years requirement is met and stated |
| `resume-blocks-alten-ruby` | a Ruby on Rails role: Ruby is never claimed and the mismatch is reported |

The free-text Summary is not compared to a reference; it is checked by rules (regex on the
blocks) and, where a rule cannot be written as a pattern, by an LLM judge.

### Applying

| Case | What it checks |
| --- | --- |
| `apply-answers-three-forms` | Phase 3 on three forms already read, no browser and no OneTap.Work: every answer comes from the profile, the salary is computed per vacancy from its band (`28,700` for a 22–30k band), gender takes the opt-out, a story question is grounded in `stories.json`; an unknown fact (driving licence), a band under the floor and a story the candidate does not have are parked and asked, never invented |
| `apply-phase1-queue` | Phase 1 on a mocked SAVED queue: the band is taken from the description prose (`30,700` for 24–32k), from the `salary` field (155 PLN/hour), or is missing (baseline, no invented band); a band under the floor (UoP gross) is raised as "apply at all?"; nothing is written to OneTap.Work |
| `method-triage-saved-queue` | `apply-method-triage` on a mocked queue with no browser and no network: own adapters read fresh (Traffit, justjoin.it and Greenhouse are group 1), Workday and Recruitee are Simplify-assisted with the account flag on Workday, an employer domain is manual or unresolved, a LinkedIn posting is reported as unresolved; the report is written with onetap.work links, the apply URLs are never shown, no status changes |
| `import-stories-prep-notes` | interview-prep notes into `stories.json`: a complete story is added without embellishment, a story with no result is asked about, the company-specific answer, salary and recruiter questions are dropped, existing stories are kept, `stories.mjs validate` is run |

### Skill choice

`skill-choice-*`: which skill a phrase starts, across all eleven skills — triage in Russian
and English, `applications-check` for one job and for the pipeline, `setup` on a fresh clone (in Russian, twice), `resume-blocks` vs `resume-render`, `resume-pdf`,
`organize-by-status`, `apply-to-jobs` vs `apply-method-triage`, `import-stories` vs
`profile-interview`, and a count question that starts nothing.

## Running

```sh
evals/run.sh --case 'job-triage-onetap-*' --runs 2 -j 1 --keep-temp
evals/run.sh --case 'skill-choice-*' --runs 2 -j 4
```

`run.sh` copies the repo without `node_modules`, `.git`, `.venv` and your `data/`, and runs
`claude plugin eval` there with the flags every case needs; extra arguments go through
(`--case`, `--runs`, `--json <file>`, `--keep-temp`). Run from the repo itself, every Bash
call in the sandbox fails with `E2BIG`: the sandbox adds a deny rule per path it finds, and
`node_modules` has thousands.

- OneTap.Work is mocked per case (`<case>/mocks/onetap/`): fixed responses, and
  `type: agent` responders for tools that answer per vacancy id. There are no shared mocks:
  a file under `evals/mocks/` would apply to every case.
- The agent often runs the scripts from the plugin's own folder rather than from the
  sandbox, so the scripts would look for `data/` next to the plugin. `run.sh` marks its copy
  with `.eval-copy`; the cases with data then make that copy's `data` a symlink to the
  sandbox's `data/` (never in a real checkout). Runs of such cases share the link, so give
  them `-j 1`; skill-choice cases need no data and run in parallel.
- `scaffold.sh` turns the sandbox into a repo root: the persona under `data/` and, where a
  case needs them, the skill scripts under `.claude/skills/`. `SKILL.md` files are not
  copied: the skills come from the plugin.
- The sandbox cannot read outside itself, so your own `data/` never reaches an eval.
- Keep `--keep-temp` on a baseline: a one-off failure is only useful if its transcript was
  kept. Reports go to `evals/results/` (git-ignored).

A single run gives no signal: the agent and the LLM judge both vary between runs. Compare
pass rates over several runs, with the same model (`claude-sonnet-5-5`, set in each
`case.yaml`).

## Data

`fixtures/persona/` is Daniel Nowak, a fictional senior frontend-leaning full-stack
TypeScript engineer in Kraków. Nothing personal of a real candidate belongs here.

- `profile.json` (with a `qa[]` bank), `stories.json`, `apply-config.json`, `notes/` and
  `runs/2026-11-26-saved/` (three vacancies as Phase 2 leaves them) for the apply cases.
- `skills.csv` (based on the project author's own ratings, with his consent, adjusted where the
  cases need a clear value), `CV_Base.html` (invented, with a support job before the
  development career), `resume-config.json` and `vacancies/` (real postings, verbatim, one per
  `resume-blocks-*` case) for the resume cases.
- `job-triage-data/criteria.md` and `auto-applier-data/profile.json` (both copied into `data/`), and
  `inputs/` (the OneTap.Work feeds and the pipeline) for the triage cases.
- The triage cases' OneTap.Work mocks are **generated** from `inputs/`. Never edit them by
  hand: change the fixture and run `python3 evals/build_mocks.py`; `tests/test_eval_mocks.py`
  fails when a mock drifts. `get_my_filters`, `bulk_update_applications` and
  `update_application_status` have no fixture and are written by hand.

## Writing a case

- Grade results, not wording: `regex` on a written file (`target: { source: file, path:
  data/runs/.../answers.md }`) or on `mock_calls`, `tool_used` for what was called, and an LLM
  judge only where a rule cannot be a pattern; write a judge's criterion as a concrete claim.
- `tool_used: Skill` with `input_match: 'job-search-agent:<skill>"'` checks which skill ran.
  "Must not run" needs both `min: 0` and `max: 0`.
- `mock_calls` holds the mock responses too, and a vacancy ID appears there as `"id"`. Anchor
  "was written" / "was not written" patterns to `"vacancyId"`, or use `tool_used` with `max: 0`.
- Anchor resume regex graders to a block, because the reply also carries a gap list:
  `\*\*Skills:\*\*(?:(?!\n\s*\n)[\s\S])*?\bKubernetes\b`; `\bJava\b(?!Script)`.
- Keep a mocked response under about 40 KB: one over about 50 KB is saved to a file the
  sandbox cannot read.
- `env` in `case.yaml` accepts only `EVAL_*`, and the operator's environment does not reach
  Bash, which is why the plugin copy's `data` is a symlink made by `scaffold.sh`.
- `scaffold.sh` must live inside the case folder. Do not put `: ` inside a YAML
  `description` without quoting it.
