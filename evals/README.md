# Agent evals

The unit tests in `tests/` check the scripts. The evals here check the **agent**: a real
Claude run of the skills, in a sandbox, against a fictional candidate. They run with
`claude plugin eval` and cost real usage, so they are not part of CI.

## What is checked

| Cases | What they check |
| --- | --- |
| `resume-blocks-sigma-frontend-react` | a role on the core stack: the Title mirrors the vacancy, the Summary is 40–75 words with no first person |
| `resume-blocks-alten-fullstack-cloud` | Java, Azure and Kubernetes (rated 0–1) stay out of the Skills block while GCP, Docker and Node.js cover the categories; the Title drops the tech; the years count skips the pre-career support job (`6+ years`) |
| `resume-blocks-apollo-8-years` | the posting asks for more years than the CV has: the Summary says nothing about years and the gap is reported |
| `resume-blocks-ink-fintech` | a crypto/fintech employer: the industry is not claimed, the years requirement is met and stated |
| `resume-blocks-alten-ruby` | a Ruby on Rails role: Ruby is never claimed and the mismatch is reported |
| `skill-choice-*` | which skill a phrase starts: `resume-blocks` vs `resume-render`, `resume-pdf` vs `resume-render`, `organize-by-status` |

The free-text Summary is not compared to a reference; it is checked by rules (regex on the
blocks) and, where a rule cannot be written as a pattern, by an LLM judge (`summary-portable`,
`mismatch-explained`).

## Running

```sh
claude plugin eval . --no-publish --trust-plugin --ablation none --scaffold \
  --runs 3 -j 4 --allow-tools Write Edit Bash Glob Grep
```

- `--case 'resume-blocks-*'` or `--case 'skill-choice-*'` runs one group. Skill-choice cases are
  cheap (a few turns); a resume-blocks case is a full tailoring run.
- `--scaffold` is required for the resume-blocks cases. `scaffold.sh` puts the persona's
  `skills.csv`, `CV_Base.html` and `resume-config.json` under `data/`, the case's vacancy as `vacancy.md`, and a
  copy of the skill scripts under `.claude/skills/` into the sandbox, so the sandbox looks like the
  repo root the skills expect. The `SKILL.md` files are not copied: the skills come from the plugin.
- The sandbox cannot read outside itself, including your own git-ignored `data/` at the repo root.
  Your data never reaches an eval.
- `--no-publish` keeps the HTML report local. Reports go to `evals/results/` (git-ignored).
- `--json <file>` saves the full result; `--keep-temp` keeps the transcripts for reading a failure.

A single run gives no signal: the agent and the LLM judge both vary between runs. Compare pass
rates over several runs, with the same model (`claude-sonnet-5-5`, set in each `case.yaml`).

Run a baseline with `--keep-temp`: a one-in-three failure that cannot be reproduced afterwards is
only useful if its transcript was kept.

## Data

- `fixtures/persona/` — Daniel Nowak, a fictional senior frontend-leaning full-stack TypeScript
  engineer in Kraków. `skills.csv` is based on the project author's own ratings, with his consent,
  adjusted where the cases need a clear value; `CV_Base.html` is invented, with a support job
  before the development career so the years count has something to skip.
- `fixtures/persona/vacancies/` — real postings, verbatim, one per case. The case folder name
  after `resume-blocks-` is the file name.
- Nothing personal of a real candidate belongs here.

## Writing a case

- Copy a `resume-blocks-*` folder, add the vacancy to `fixtures/persona/vacancies/` under the new
  slug, and write graders for the one rule the case is about.
- Anchor regex graders to a block. The reply also carries a gap list that names the skills left
  out, so a bare `Kubernetes` pattern would fail on an honest report.
  - inside the Skills block: `\*\*Skills:\*\*(?:(?!\n\s*\n)[\s\S])*?\bKubernetes\b`
  - inside the Summary: `\*\*Summary:\*\*(?:(?!\*\*Skills)[\s\S])*?6\+ years`
  - `\bJava\b(?!Script)` so `JavaScript` does not count as Java.
- `tool_used: Skill` with `input_match: 'career-profile:<skill>"'` checks which skill ran. "Must
  not run" needs both `min: 0` and `max: 0`.
- Prefer regex and `tool_used` over an LLM judge; write a judge's criterion as a concrete claim.
