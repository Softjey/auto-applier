# auto-applier

Applies to the jobs you saved on [OneTap.Work](https://onetap.work) for you: tailors a
resume to each vacancy, fills the application form in a real browser, and records what
was sent. It **never invents an answer** — every fact on a form comes from your own
`profile.json`, and anything it does not know it asks you.

It is a set of agent skills (Claude Code, Codex) plus two small tools:

| | |
| --- | --- |
| `.claude/skills/` | the skills: `setup-data-repo`, `profile-interview`, `apply-method-triage`, `apply-to-jobs` |
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
git clone <this repo> auto-applier
claude                                 # or: codex — open it in the workspace
```

Then ask: **"set me up"** — the `setup-data-repo` skill creates your private data repo,
and `profile-interview` fills in your facts. After that:

- *"triage my saved jobs"* → `triage/<date>.md` in your data repo, grouped by how each
  application has to be submitted;
- *"apply to my saved jobs"* → the four-phase apply run.

Requires Node 22+, the OneTap.Work MCP server, and Chrome with Claude in Chrome (or
Codex's `browser` plugin). The extension in `autofill/` additionally needs pnpm.

## Where things are found

Scripts locate your data repo via `$APPLIER_DATA_DIR`, then the path in `.data-dir`, then
`../auto-applier-data`. See `CLAUDE.md` for the full map.

## License

[MIT](LICENSE). The skills and scripts carry no personal data; yours stays in your own private data repo.
