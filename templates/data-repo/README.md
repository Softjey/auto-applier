# job-search-agent — my data

This is the **private** half of [job-search-agent]({{CODE_REPO}}): everything that is about me
rather than about how to search, write a resume or apply. The code repo reads it as `data/` at
its root: clone this repo there, or make `data` a symlink to it.

> **Never add a public remote to this repository.** It holds my phone number, salary
> expectations, work-authorization status, answers given to employers, every resume sent and
> recordings of filled-in forms.

| Path | What it is |
| --- | --- |
| `criteria.md` | my rules for judging a vacancy and every decision that set a precedent (`job-triage`) |
| `linkedin/filters.json` | the saved LinkedIn search |
| `linkedin/ledger.json` | every LinkedIn job already judged, with verdict and reason |
| `linkedin/session.json` | LinkedIn cookies for save and dismiss (git-ignored, optional) |
| `skills.csv` | skill ratings 0–5, the source `resume-blocks` writes a resume from |
| `CV_Base.html` | the base resume with the `[Position placeholder]`, `[Summary placeholder]` and `[skills placeholder]` placeholders |
| `resume-config.json` | `resumeFileName`, the file name a recruiter sees |
| `out/` | generated resumes, one folder per vacancy, sorted by status by `organize-by-status` |
| `profile.json` | structured facts about me plus the `qa[]` bank of form answers (`profile-interview`, `profile-qa.mjs`) |
| `apply-config.json` | the resume to send and the vocabulary of the languages my applications are written in |
| `stories.json` | STAR stories and about-me texts that free-text fields are grounded in (`import-stories`) |
| `credentials.json` | employer-portal logins kept by the autofill extension (optional; real passwords) |
| `triage/` | `<date>-vacancies.md` from `job-triage`, `<date>.md` from `apply-method-triage` |
| `runs/<run-id>/` | the audit trail of each apply run |

`skills.example.csv`, `CV_Base.example.html` and `resume-config.example.json` are examples:
rename them without `.example` and replace them with your own. They have different names so
that an agent looking a file up by name never picks the made-up person instead of the real one.

Rules for the resume files:

- Put `[skills placeholder]` alone on a line of its own, a plain paragraph or a list item,
  formatted the way the skill lines should look. `resume-render` copies that line once per skill
  line and swaps only the placeholder text. Inside a table cell or next to other text it refuses
  to run instead of guessing.
- Type each placeholder in one go: changing formatting in the middle of one splits it in the
  export, and `resume-render` then says which placeholder to retype. Letter case does not matter.
