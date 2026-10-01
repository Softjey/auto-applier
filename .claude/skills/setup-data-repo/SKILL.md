---
name: setup-data-repo
description: Create the user's private data repo — the separate, private git repository that holds their profile.json, apply-config.json, stories, credentials, triage reports and apply-run audit trail — and point this code repo at it. Use on a fresh clone, when any skill reports "No data repo found", or when the user says "set me up", "create my private repo", "I just cloned auto-applier".
---

# Set up the data repo

This repo is code and generic knowledge; it holds nothing about any one person.
Everything personal — `profile.json`, `apply-config.json`, `stories.json`,
`credentials.json`, `triage/`, `runs/` — lives in a **private data repo** next to
it. This skill creates that repo so the other skills have somewhere to read and
write. Do it once per user; it is safe to re-run (it refuses to overwrite).

## 1. Check what exists

```sh
node -e 'import("./.claude/skills/apply-to-jobs/scripts/lib/data-dir.mjs").then(m=>console.log(m.findDataDir()))'
```

- A path that already has `profile.json` → set up. Say so, show the path, and offer
  `profile-interview` to fill gaps. Stop.
- `null` → continue.
- Old single-repo layout (a `profile.json` sitting in this repo's root, from before
  the split) → see § Migrating at the end instead.

## 2. Ask three things, in one message

1. **Where should it live?** Default `../auto-applier-data` (a sibling of this repo,
   found with no configuration). Anywhere outside this repo works; the skill then
   records it in `.data-dir`.
2. **Do you keep a resume-rendering repo?** The path to it, or none. It fills
   `apply-config.json`'s `paths.resumeRepo`; without one, tailoring a resume per
   vacancy is unavailable and it stays `null`.
3. **Should it have a remote?** Only ever a **private** one, and only if they want
   off-machine backup. Never create or add a public remote: the repo will hold a
   phone number, salary expectations, work-authorization status and recordings of
   filled-in forms. Creating any remote is the user's call — ask, and do nothing
   if they do not say yes.

## 3. Create it

```sh
node .claude/skills/apply-to-jobs/scripts/init-data-repo.mjs \
  [--dir=<path>] [--resume-repo=<path>]
```

It copies `templates/data-repo/` (skeleton `profile.json` with every field `null`,
skeleton `apply-config.json`, `README.md`, `CLAUDE.md`, `.gitignore`, empty `runs/`
and `triage/`), fills the resume paths, runs `git init` with one commit, and writes
`.data-dir` when the location is not the default. It refuses a directory inside this
repo and one that already has a `profile.json`.

If they asked for a remote: `gh repo create <name> --private --source=<dir> --push`
— after confirming the exact name and that it is private.

## 4. Fill the profile

Hand over to the **`profile-interview`** skill now; a skeleton profile makes
`apply-to-jobs` stop on every question. When it finishes, commit in the data repo:
`git -C <dir> add -A && git -C <dir> commit -m "feat(profile): initial facts"`.

## 5. Make the directory reachable by the agent

The data repo is outside this repo's working directory, so the agent may be asked
for permission on every read and write. Offer to add it once:

- Claude Code — `permissions.additionalDirectories` in `.claude/settings.local.json`
  (git-ignored by design; create it if absent), or `/add-dir <path>`.
- Codex — the path as a writable root in `.codex/config.toml`'s sandbox settings.

## 6. Verify

```sh
node .claude/skills/apply-to-jobs/scripts/profile-qa.mjs list   # "No matching qa entries." is right for a new profile
git -C <dir> remote -v                                           # empty, or a private remote you created
```

Tell the user where the data repo is, that it is private, that `import-stories` is where
their STAR stories come from (hand it any material, or it interviews them), and that the next step is
`apply-method-triage` (to see the queue) or `apply-to-jobs`.

## Migrating from the old single-repo layout

Before the split, the personal files sat in this repo's root and `runs/` beside them.
If a `profile.json` is here (git-ignored now): create the data repo with step 3, then **move** (not copy) `profile.json`, `stories.json`,
`credentials.json`, `apply-config.json`, `runs/` into it, turn old
`runs/<date>-triage.md` files into `triage/<date>.md` and drop the `.json` twins,
`git init` and commit. Verify with `profile-qa.mjs list` before deleting anything
from here, and tell the user that this repo's own git history still contains the old
files until they rewrite it.
