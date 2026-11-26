# Career profile — personal data

The private half of the career profile. Code and skills live in a separate repository; this one
holds only what is about one person.

| File | What it is |
| --- | --- |
| `skills.csv` | skill ratings 0–5 — the source `resume-blocks` writes a resume for a vacancy from |
| `CV_Base.html` | the base resume (a Google Docs export) with the `[Position placeholder]`, `[Summary placeholder]` and `[skills placeholder]` placeholders |
| `resume-config.json` | `resumeFileName` — the resume file name a recruiter sees (without it — `CV.pdf`) |
| `out/` | generated resumes, one folder per vacancy |

## Setup

The code repository reads this one as `data/` at its root.

1. Copy `templates/data-repo/` from the code repository to `data/` at its root (git-ignored there)
   and run `git init` in it. Keeping it elsewhere works too: make `data` a symlink to it and add
   that folder to `permissions.additionalDirectories` in the code repository's
   `.claude/settings.local.json`, so the agent can read and write through the link.
2. Rename `skills.example.csv` → `skills.csv`, `CV_Base.example.html` → `CV_Base.html` and
   `resume-config.example.json` → `resume-config.json`, then replace them with your own. The
   examples have different names so that an agent looking a file up by name never picks the
   made-up person instead of the real one.

Open Claude Code in the code repository.

## Rules

- A private remote or none at all. This holds contact details, work history and every resume
  sent to an employer.
- No code here — scripts and skills belong in the code repository.
- Put `[skills placeholder]` alone on a line of its own — a plain paragraph or a list item — and
  format it the way the skill lines should look (font, size, spacing). `resume-render` copies that
  whole line once per skill line and swaps only the placeholder text, with the category bold and the
  items regular, so any Google Docs export works as is. Inside a table cell or next to other text it
  refuses to run instead of guessing.
- Type each placeholder in one go. Changing formatting in the middle of one splits it in the export;
  `resume-render` then stops and says which placeholder to retype. Letter case does not matter.
