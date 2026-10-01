# auto-applier — my data

This is the **private** half of [auto-applier]({{CODE_REPO}}): everything that
is about me rather than about how to apply. The code, the skills and the ATS
notes live in the code repo; nothing in here is ever needed to read them.

> **Never add a public remote to this repository.** It holds my phone number,
> salary expectations, work-authorization status, answers given to employers
> and recordings of filled-in forms.

| Path | What it is |
| --- | --- |
| `profile.json` | Structured facts about me plus the `qa[]` bank of form answers. Edited by the `profile-interview` skill and `profile-qa.mjs`. |
| `apply-config.json` | Paths to my resume repo, the resume file name, the vocabulary of the languages my applications are written in. |
| `stories.json` | STAR stories (tagged by theme and stack) and about-me texts that free-text fields are grounded in. Built by the `import-stories` skill from whatever material I hand over; checked with `stories.mjs validate`. |
| `credentials.json` | My employer-portal logins, kept by the autofill extension's password manager (optional). Private — real passwords. |
| `triage/<date>.md` | One readable report per triage of the SAVED queue. |
| `runs/<run-id>/` | The audit trail of each apply run: per vacancy `answers.md`, `salary.json`, the CV that was sent, screen recordings; plus a `summary.md`. |

The code repo finds this directory through `$APPLIER_DATA_DIR`, then the path
in its `.data-dir` file, then `../auto-applier-data`.
