# job-search-agent

Your job search, run by an agent: it sorts new vacancies from [OneTap.Work](https://onetap.work)
and LinkedIn against your own criteria, tailors a resume to each one you keep, and applies
for you in a real browser, recording what was sent. It **never invents an answer** — every
fact on a form comes from your own `profile.json`, and anything it does not know it asks you.

It is a set of Claude Code skills plus two small tools:

| | |
| --- | --- |
| `.claude/skills/` | triage: `job-triage`, `applications-check`, `setup-job-triage` ([guide](docs/job-triage.md)); resumes: `resume-blocks`, `resume-render`, `resume-pdf`, `organize-by-status` ([guide](docs/resume.md)); applying: `setup-data-repo`, `profile-interview`, `import-stories`, `apply-method-triage`, `apply-to-jobs` |
| `.claude/skills/apply-to-jobs/ats/` | per-ATS notes: quirks that cost a failed submit to learn |
| `apps/autofill/` | a browser extension + loopback server that prefill forms Simplify does not cover ([README](apps/autofill/README.md)) |
| `apps/skills-rating/` | a local app for rating your skills |
| `templates/data-repo/` | the skeleton of your private data repo |

## Your data stays out of this repo

This repo holds code only. Your criteria, skill ratings, base resume, profile, answers,
salary expectations, run history and recordings live in a **separate private repo**, reached as `data/` at the root of this one
(cloned there or symlinked; git-ignored). Never give that repo a public remote.

## Getting started

```sh
git clone https://github.com/Softjey/job-search-agent.git
cd job-search-agent
claude
```

Then ask: **"set me up"** — the `setup-data-repo` skill creates your private data repo,
and `profile-interview` fills in your facts. Then **"import my stories"** — hand the
agent whatever you have about your work (interview prep, notes, CV, a pasted chat; or
nothing, and it interviews you) and `import-stories` turns it into the STAR stories
that essay questions are answered from. After that:

- *"triage my saved jobs"* → `data/triage/<date>.md`, grouped by how each
  application has to be submitted;
- *"apply to my saved jobs"* → the four-phase apply run.

## Requirements

- Node 22+.
- A [OneTap.Work](https://onetap.work) account with its MCP server connected: it is
  where saved vacancies come from and where each application is recorded.
- Claude Code with Chrome and the Claude in Chrome extension.
- Python 3.10+ for triage (stdlib only; `uv` to run its tests).
- pnpm, for the script tests and the `apps/autofill/` extension.
- macOS or Linux. On Windows use WSL.

## Your resume

`setup-data-repo` asks how you send a resume, and either answer works:

- **One resume for everything** — point it at a finished PDF; it is sent with every
  application (`paths.baseResume`).
- **A resume tailored per vacancy** — by this repo's own resume skills, from your
  `skills.csv` and `CV_Base.html` in `data/` ([guide](docs/resume.md)). Finished PDFs land
  in `data/out/SAVED/<Company>_<vacancyId>-<Title>/`.

## Limits worth knowing

- It automates job applications. You are responsible for following the terms of the
  sites you apply on; it never invents an answer and asks you whenever it does not
  know one.
- Per-site support is uneven: `apps/autofill/` has adapters for a handful of ATSes and
  `.claude/skills/apply-to-jobs/ats/` holds notes for more. Anything else is driven
  step by step by the agent.
- Salary handling defaults to PLN; set your own currency in `profile.json`
  (`compensation.defaultCurrency`) and, for other languages, phrases in
  `apply-config.json` (`formVocabulary`).
- Everything personal stays in your private data repo, never here.

## Where things are found

Your data is always `data/` at the root of this repo. See `CLAUDE.md` for the full map.

## Security

The autofill extension talks only to a server on `127.0.0.1` and hands saved portal
passwords to this extension's pinned id alone; see [SECURITY.md](SECURITY.md) to report a
problem.

## License

[MIT](LICENSE). The skills and scripts carry no personal data; yours stays in your own private data repo.
