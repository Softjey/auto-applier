# Agent evals

The tests check the scripts; the evals here check the **agent**: a real Claude run of the
skills, in a sandbox, against a fictional candidate. They run with `claude plugin eval`,
cost real usage, and are not part of CI.

## What is checked

| Case | What it checks |
| --- | --- |
| `apply-answers-three-forms` | Phase 3 on three forms already read, no browser and no OneTap.Work: every answer comes from the profile, the salary is computed per vacancy from its band (`28,700` for a 22–30k band), gender takes the opt-out, a story question is grounded in `stories.json`; an unknown fact (driving licence), a band under the floor and a story the candidate does not have are parked and asked, never invented |
| `skill-choice-*` | which skill a phrase starts: `apply-to-jobs` vs `apply-method-triage`, `import-stories` vs `profile-interview`, `setup-data-repo` |

## Running

```sh
evals/run.sh --runs 2 -j 6 --keep-temp
evals/run.sh --case 'skill-choice-*' --runs 2
```

`run.sh` copies the repo without `node_modules` and `.git` and runs the evals there. Run
from the repo itself, every Bash call in the sandbox fails with `E2BIG`: the sandbox adds a
deny rule per path it finds, and `autofill/node_modules` has thousands. Extra arguments go
to `claude plugin eval` (`--case`, `--runs`, `--json <file>`, `--keep-temp`).

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
