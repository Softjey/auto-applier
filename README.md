# auto-applier

Applies to the jobs you saved on [OneTap.Work](https://onetap.work) for you: tailors a
resume to each vacancy, fills the application form in a real browser, and records what
was sent. It **never invents an answer** — every fact on a form comes from your own
`profile.json`, and anything it does not know it asks you.

It is a set of agent skills (Claude Code, Codex) plus two small tools:

| | |
| --- | --- |
| `.claude/skills/` | the skills: `setup-data-repo`, `profile-interview`, `import-stories`, `apply-method-triage`, `apply-to-jobs` |
| `.claude/skills/apply-to-jobs/ats/` | per-ATS notes: quirks that cost a failed submit to learn |
| `autofill/` | a browser extension + loopback server that prefill forms Simplify does not cover ([README](autofill/README.md)) |
| `templates/data-repo/` | the skeleton of your private data repo |

## Your data stays out of this repo

This repo holds code only. Your profile, answers, salary expectations, run history and
recordings live in a **separate private repo** next to it (`../auto-applier-data`). Never
give that repo a public remote.

## Getting started

```sh
mkdir applier && cd applier            # a workspace for this repo and your data repo
git clone https://github.com/Softjey/auto-applier.git auto-applier
claude                                 # or: codex — open it in the workspace
```

Then ask: **"set me up"** — the `setup-data-repo` skill creates your private data repo,
and `profile-interview` fills in your facts. Then **"import my stories"** — hand the
agent whatever you have about your work (interview prep, notes, CV, a pasted chat; or
nothing, and it interviews you) and `import-stories` turns it into the STAR stories
that essay questions are answered from. After that:

- *"triage my saved jobs"* → `triage/<date>.md` in your data repo, grouped by how each
  application has to be submitted;
- *"apply to my saved jobs"* → the four-phase apply run.

## Requirements

- Node 22+.
- A [OneTap.Work](https://onetap.work) account with its MCP server connected: it is
  where saved vacancies come from and where each application is recorded.
- Claude Code with Chrome and the Claude in Chrome extension, or Codex with its
  `browser` plugin.
- pnpm, only for the `autofill/` extension.

## Your resume

`setup-data-repo` asks how you send a resume, and either answer works:

- **One resume for everything** — point it at a finished PDF; it is sent with every
  application (`paths.baseResume`).
- **A resume repo that tailors one per vacancy** — give it the path; the agent reads
  that repo's README and skills, wires it up, and tells you what a run will do with
  it. Finished PDFs are expected in `out/SAVED/<Company>_<vacancyId>-<Title>/`.

## Limits worth knowing

- It automates job applications. You are responsible for following the terms of the
  sites you apply on; it never invents an answer and asks you whenever it does not
  know one.
- Per-site support is uneven: `autofill/` has adapters for a handful of ATSes and
  `.claude/skills/apply-to-jobs/ats/` holds notes for more. Anything else is driven
  step by step by the agent.
- Salary handling defaults to PLN; set your own currency in `profile.json`
  (`compensation.defaultCurrency`) and, for other languages, phrases in
  `apply-config.json` (`formVocabulary`).
- Everything personal stays in your private data repo, never here.

## Where things are found

Scripts locate your data repo via `$APPLIER_DATA_DIR`, then the path in `.data-dir`, then
`../auto-applier-data`. See `CLAUDE.md` for the full map.

## License

[MIT](LICENSE). The skills and scripts carry no personal data; yours stays in your own private data repo.
