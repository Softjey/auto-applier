# Agent evals

The tests check the scripts; the evals here check the **agent**: a real Claude run of the
skills, in a sandbox, against a fictional candidate. They run with `claude plugin eval`,
cost real usage, and are not part of CI.

## What is checked

| Case | What it checks |
| --- | --- |
| `apply-answers-three-forms` | Phase 3 on three forms already read, no browser and no OneTap.Work: every answer comes from the profile, the salary is computed per vacancy from its band (`28,700` for a 22–30k band), gender takes the opt-out, a story question is grounded in `stories.json`; an unknown fact (driving licence), a band under the floor and a story the candidate does not have are parked and asked, never invented |
| `apply-phase1-queue` | Phase 1 on a mocked SAVED queue: the band is taken from the description prose (`30,700` for 24–32k), from the `salary` field (155 PLN/hour), or is missing (baseline, no invented band); a band under the floor (UoP gross) is raised as "apply at all?"; nothing is written to OneTap.Work |
| `method-triage-saved-queue` | `apply-method-triage` on a mocked queue with no browser and no network: own adapters read fresh (Traffit, justjoin.it and Greenhouse are group 1), Workday and Recruitee are Simplify-assisted with the account flag on Workday, an employer domain is manual or unresolved, a LinkedIn posting is reported as unresolved; the report is written with onetap.work links, the apply URLs are never shown, no status changes |
| `import-stories-prep-notes` | interview-prep notes into `stories.json`: a complete story is added without embellishment, a story with no result is asked about, the company-specific answer, salary and recruiter questions are dropped, existing stories are kept, `stories.mjs validate` is run |
| `skill-choice-*` | which skill a phrase starts: `apply-to-jobs` vs `apply-method-triage`, `import-stories` vs `profile-interview`, `setup-data-repo` |

## Running

```sh
evals/run.sh --case apply-phase1-queue --runs 2 -j 1 --keep-temp
evals/run.sh --case 'skill-choice-*' --runs 2
```

`run.sh` copies the repo without `node_modules` and `.git` and runs the evals there. Run
from the repo itself, every Bash call in the sandbox fails with `E2BIG`: the sandbox adds a
deny rule per path it finds, and `autofill/node_modules` has thousands. Extra arguments go
to `claude plugin eval` (`--case`, `--runs`, `--json <file>`, `--keep-temp`).

- The OneTap.Work server is mocked per case (`<case>/mocks/onetap/`): fixed responses,
  and `type: agent` responders for tools that answer per vacancy id.
- The agent often runs the scripts from the plugin's own folder rather than from the
  sandbox, so the scripts would look for the data repo next to the plugin. `run.sh` marks
  its copy with `.eval-copy`, and the data cases' `scaffold.sh` then point that copy's
  `.data-dir` at the sandbox's `data/` (never in a real checkout). Runs of one such case
  share the copy, so give them `-j 1`; different cases run in separate copies.
- `scaffold.sh` turns the sandbox into a repo root: the `apply-to-jobs` scripts, browser
  helpers and ATS notes under `.claude/skills/apply-to-jobs/`, the persona as `data/`, and
  a `.data-dir` pointing at it. `SKILL.md` files are not copied: the skills come from the
  plugin.
- The sandbox cannot read outside itself, so a real data repo never reaches an eval.
- Keep `--keep-temp` on a baseline: a one-off failure is only useful if its transcript
  was kept.

A single run gives no signal: the agent and the LLM judge both vary between runs. Compare
pass rates over several runs, with the same model (`claude-sonnet-5-5`, set in each
`case.yaml`).

## Data

- `fixtures/persona/` — Daniel Nowak, a fictional senior frontend-leaning full-stack
  TypeScript engineer in Kraków: `profile.json` with a `qa[]` bank (facts, policies, one
  employer-specific entry), `stories.json` with three STAR stories and one about-me text,
  and `apply-config.json`.
- `fixtures/persona/runs/2026-11-26-saved/` — three vacancies as Phase 2 leaves them:
  `form.json` in the shape `browser/extract-form.js` produces, plus `vacancy.md` with the
  salary band. The companies are fictional.
- Nothing personal of a real candidate belongs here.

## Writing a case

- Grade results, not wording: `regex` on a written file (`target: { source: file, path:
  data/runs/.../answers.md }`), `tool_used` for what was called, and an LLM judge only for
  "was this asked rather than answered".
- `tool_used: Skill` with `input_match: 'auto-applier:<skill>"'` checks which skill ran.
  "Must not run" needs both `min: 0` and `max: 0`.
