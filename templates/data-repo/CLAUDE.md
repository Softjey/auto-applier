# auto-applier — my data

Private data repo for the auto-applier code repo at `{{CODE_REPO}}`. The skills
(`apply-to-jobs`, `apply-method-triage`, `profile-interview`, `setup-data-repo`)
live there — **start Claude Code in the code repo**, not here; it locates this
directory on its own.

## Rules

- **Never push this repository to a public remote.** Private remotes only.
- Nothing here is code. Do not add scripts or skills to this repo; they belong
  in the code repo so every user gets them.
- `qa[]` in `profile.json` is machine-managed — add entries with
  `profile-qa.mjs add`, never by hand-editing the array. Structured fields above
  it are fine to edit directly.
- The core rule of the system: an application form is never answered with an
  invented fact. Only `profile.json` / `stories.json` facts, or ask the user.

## Layout

See `README.md`. Triage reports go to `triage/<date>.md` (Markdown only);
apply runs go to `runs/<date>-<slug>/`.
