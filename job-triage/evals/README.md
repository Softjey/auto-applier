# Agent evals

The unit tests in `tests/` check the scripts. The evals here check the **agent**: a real
Claude run of the skills, in a sandbox, against a fictional candidate and a mocked
onetap. They run with `claude plugin eval` and cost
real usage, so they are not part of CI.

## What is checked

| Cases | What they check |
| --- | --- |
| `job-triage-onetap-rules-a`, `-rules-b` | clear-cut rejections by the rules (stack, role, salary below the floor, more than 7 years, German required, the current employer) and a Kraków hybrid save |
| `job-triage-onetap-duplicates` | copies of one job in the batch, two agencies with one role, jobs already in the pipeline (matched by LinkedIn ID, or by company and title) |
| `job-triage-onetap-borderline` | forward-deployed and platform roles go to the candidate as questions and are never written |
| `skill-choice-*` | which skill a phrase starts: triage in Russian and English, `applications-check` for one job and for the pipeline, `setup-job-triage` on a fresh clone, and a count question that starts nothing |

Every triage case also checks that the skill fired, that verdicts were written, that
nothing was written with a placeholder note, and that the agent never calls the data a
test.

## Running

```sh
evals/run.sh --runs 2 -j 1
```

`run.sh` copies the repo to a temp folder without `data/` and runs `claude plugin eval`
there with the flags every case needs; extra arguments go through.

- `--case 'skill-choice-*'` runs one group. Skill-choice cases are cheap (four turns);
  a triage case is a full triage run.
- `--scaffold` is required for the triage cases: it copies the persona into the sandbox.
- The triage cases put the persona's data at `data/` in the sandbox, where the skill reads
  it. The scripts resolve `data/` next to the plugin, so in the copy `run.sh` makes (marked
  by `.eval-copy`) `scaffold.sh` links that `data` to the sandbox's. Your own `data/` is
  never copied and never read. Cases share that link, so run the triage cases with `-j 1`;
  skill-choice cases need no data and can run in parallel.
- `--no-publish` keeps the HTML report local. Reports go to `evals/results/`
  (git-ignored).
- `--json <file>` saves the full result; `--keep-temp` keeps the transcripts
  (`trace.jsonl`, `mock-calls.jsonl`) for reading a failure.

A single run of one case gives no signal: the agent and the LLM judge both vary between
runs. Compare pass rates over several runs, with the same model (`claude-sonnet-5-5`,
set in each `case.yaml`).

## Data

- `fixtures/persona/` is the single source. `job-triage-data/` (as `data/`) and
  `auto-applier-data/` are what `scaffold.sh` copies into the sandbox; `inputs/` holds the
  onetap feeds and the pipeline.
- The onetap mocks under `evals/` are **generated** from `inputs/`. Never edit them by
  hand: change the fixture and run `python3 evals/build_mocks.py`. The unit test
  `tests/test_eval_mocks.py` fails when a mock drifts.
- `get_my_filters`, `bulk_update_applications` and `update_application_status` mocks have
  no fixture; they are written by hand.
- The persona is fictional. The vacancy texts are real postings, kept verbatim, with real
  company names. Nothing personal of a real candidate belongs here.

## Writing a case

- A case is a folder with `case.yaml`; the shared onetap mocks are in `evals/mocks/`, a
  case adds its own feed under `<case>/mocks/onetap/`.
- Prefer graders that read results over an LLM judge: `regex` on `mock_calls` for what
  was written, `tool_used` for what was called. Use `llm` only for the report text, and
  write the criterion as a concrete claim.
- `mock_calls` holds the mock responses too, and a vacancy ID appears there as `"id"`.
  Anchor "was written" / "was not written" patterns to `"vacancyId"`.
- `tool_used: Skill` with `input_match: 'job-triage:<skill>"'` checks which skill ran.
  "Must not run" needs both `min: 0` and `max: 0`.
- Keep a case's feed under about 40 KB: a tool response over about 50 KB is saved to a file
  the sandbox cannot read.
- `env` in `case.yaml` accepts only `EVAL_*`, and the operator's environment does not
  reach Bash, which is why the plugin copy's `data` is a symlink made by `scaffold.sh`.
- The sandbox cannot read or write outside itself; `scaffold.sh` must live inside the
  case folder.
- Do not put `: ` inside a YAML `description` without quoting it.
