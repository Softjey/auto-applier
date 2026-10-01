# auto-applier — my data

Private data repo for the auto-applier code repo at `{{CODE_REPO}}`. The skills
(`apply-to-jobs`, `apply-method-triage`, `profile-interview`, `import-stories`, `setup-data-repo`)
live there. Start Claude Code in the code repo or in a workspace folder that
contains both repos side by side; the scripts locate this directory on their own.

## Rules

- **Never push this repository to a public remote.** Private remotes only.
- Nothing here is code. Do not add scripts or skills to this repo; they belong
  in the code repo so every user gets them.
- `qa[]` in `profile.json` is machine-managed — add entries with
  `profile-qa.mjs add` (requires `--canonical` and `--kind`: fact / policy /
  narrative / employer-specific), never by hand-editing the array. Structured fields above
  it are fine to edit directly.
- `qa[]` holds facts, policies and short answers only; every story lives in
  `stories.json`.
- `stories.json` is edited by an agent through the `import-stories` skill (plain JSON,
  no importer); run `stories.mjs validate` after any change.
- The core rule of the system: an application form is never answered with an
  invented fact. Only `profile.json` / `stories.json` facts, or ask the user.

## Layout

See `README.md`. Triage reports go to `triage/<date>.md` (Markdown only);
apply runs go to `runs/<date>-<slug>/`.
