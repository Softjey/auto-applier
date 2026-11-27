---
name: setup
description: Set the user up — create their private data repo as data/ at the root of this repo, then fill what the parts they will use need — triage criteria and the LinkedIn search, the resume files, the profile and stories for applying. Use on a fresh clone, when any skill or script reports "No data repo found", when a part is still empty (blank criteria.md, skeleton profile.json), or when the user says "set me up", "настрой меня", "create my private repo", "fill my criteria", "I just cloned this repo".
---

# Set up

This repo is code and generic knowledge; it holds nothing about any one person.
Everything personal lives in a **private data repo**, reached as `data/` at the root
of this repo (git-ignored): `criteria.md` and `linkedin/` for triage, `skills.csv`,
`CV_Base.html`, `resume-config.json` and `out/` for resumes, `profile.json`,
`apply-config.json`, `stories.json`, `credentials.json`, `runs/` for applying,
`triage/` for both kinds of report. This skill creates it once and then fills only the
parts the user will use. It is safe to re-run: it refuses to overwrite, and on a
second run it picks up where the parts are still empty.

## 1. Check what exists

```sh
ls -la data/ data/criteria.md data/profile.json data/skills.csv profile.json
```

- No `data/` → § 2.
- `data/` exists → skip to § 4 and fill only what is still empty: `criteria.md` with
  `<…>` placeholders, `profile.json` whose fields are all `null`, no `skills.csv` /
  `CV_Base.html` (only the `.example` files). Say what is already done.
- Old single-repo layout (a `profile.json` sitting in this repo's root) → § Migrating
  at the end.

## 2. Ask four things, in one message

1. **What will they use?** Triage (sort new vacancies against their criteria),
   resumes (tailor one per vacancy), applying (fill and send application forms). Any
   combination; all three is the default.
2. **Where should it live?** Default `data/` inside this repo, nothing to configure.
   If they already have a private data repo, they clone it into `data/` instead and
   this skill goes on at § 4. Anywhere outside this repo works too: the script then
   makes `data` a symlink to it and allows that folder once in
   `.claude/settings.local.json`.
3. **How do they send a resume?** (only with applying)
   - **Tailored per vacancy** (the default, and the only option with resumes) → pass
     `--resume-repo=<absolute path of data/>`, see § 4b. Another repo that tailors
     resumes works the same way, with its path.
   - **One resume for everything** → the path of a finished PDF (`--resume-file`). It
     goes out untailored with every application; `paths.baseResume`.
   - **Not yet** → neither flag. The apply run will stop and ask for a resume.
4. **Should it have a remote?** Only ever a **private** one, and only if they want
   off-machine backup. Never create or add a public remote: the repo will hold a
   salary floor, a phone number, work-authorization status, every job they rejected
   and recordings of filled-in forms. Creating any remote is the user's call — ask,
   and do nothing if they do not say yes.

Will they use LinkedIn for triage? Reading LinkedIn needs no account. Saving and
dismissing jobs there needs their cookies in `linkedin/session.json`, and automating
a logged-in session can get an account restricted. Default is no; ask it in § 4a, before the LinkedIn search.

## 3. Create it

```sh
node .claude/skills/apply-to-jobs/scripts/init-data-repo.mjs \
  [--dir=<path>] [--resume-repo=<path> | --resume-file=<path-to.pdf>]
```

It copies the whole of `templates/data-repo/` (a blank `criteria.md`,
`linkedin/filters.json` and an empty ledger; the resume examples; a skeleton
`profile.json` with every field `null` and `apply-config.json`; `README.md`,
`.gitignore`, empty `out/`, `runs/` and `triage/`), fills the resume paths, runs
`git init` with one commit, and, for a `--dir` elsewhere, links `data` to it and
allows the folder in `.claude/settings.local.json`. It refuses a directory inside
this repo other than `data/`, and one that already has a `profile.json`.

If they asked for a remote: `gh repo create <name> --private --source=data --push`
— after confirming the exact name and that it is private.

## 4. Fill the parts they use

In this order, skipping the parts they do not use. Commit in the data repo after
each one: `git -C data add -A && git -C data commit -m "feat(<part>): initial …"`.

### 4a. Triage

#### `criteria.md`

A blank file makes every verdict a guess. Walk the user through it section by
section, asking for real decisions rather than abstractions: ask which of the
last postings they rejected and why, which they would have taken, and what the
floor is.

1. The candidate in one line.
2. Stack: disqualifying, explicitly fine, where "X or Y" stops.
3. Role type: what they want, what they never want.
4. Location: remote, hybrid and on-site, with the places each one allows.
5. Salary: the floor, the target, how rates are compared.
6. Companies: permanent bans and temporary holds.
7. Seniority: the target and what lower levels are acceptable.
8. Language.

Write only what they said. An unknown stays a `<…>` placeholder and the first
run will surface it as `UNDECIDED` with a question. Commit in the data repo:
`git -C data add -A && git -C data commit -m "feat(criteria): initial rules"`.

#### The LinkedIn search

LinkedIn has no saved search, so `linkedin/filters.json` is it. Generate it from
the onetap saved search instead of typing it:

1. Call `get_my_filters` and save the response to `/tmp/onetap-filters.json`.
2. Set `default_country` in `data/linkedin/filters.json` to the country their cities
   are in, because `sync-filters` appends it to a city that has no verified geoId.
3. Preview, then write:

```sh
python3 .claude/skills/job-triage/sources/linkedin.py sync-filters /tmp/onetap-filters.json --dry-run
python3 .claude/skills/job-triage/sources/linkedin.py sync-filters /tmp/onetap-filters.json
```

4. Show what a sweep would cost before anyone runs one:
   `python3 .claude/skills/job-triage/sources/linkedin.py search --dry-run`.

If they do not use onetap, fill `keywords` and `locations` by hand from the
template and the notes in `.claude/skills/job-triage/sources/LINKEDIN.md`.

### 4b. Resumes

The user puts their own `skills.csv` (every skill rated 0–5), `CV_Base.html` (the base
resume with `[Position placeholder]`, `[Summary placeholder]` and `[skills placeholder]`)
and `resume-config.json` (`resumeFileName`) in `data/`, replacing the `.example` files —
`data/README.md` says how to write the placeholders. Do not write these for them: they
are the user's own text. `apps/skills-rating/` is a local app for rating the skills
(`cd apps/skills-rating && npm install && npm run dev`).

With this repo's own skills, `paths.resumeRepo` is `data/` itself: `resume-render` writes
to `data/out/<Company>-<Position>/`, `organize-by-status` sorts that into
`data/out/SAVED/…`, and the user puts their `skills.csv`, `CV_Base.html` and
`resume-config.json` in `data/` (examples are in the template). With another repo, do not
assume how it works — read its `README.md` and `.claude/skills/`. Either way, establish,
and write down in `data/apply-config.json`:

1. **Where finished PDFs land.** The autofill extension lists them from
   `<resumeRepo>/out/SAVED/<Company>_<vacancyId>-<Title>/<any>.pdf`. If the repo uses a
   different layout, say so to the user and either point `AUTOFILL_RESUME_OUT` at the
   right folder or adapt its output; do not guess.
2. **How to build one for a vacancy** (the command or skill that does it) — that is
   what `apply-to-jobs` Phase 1 step 5 will call. Confirm it works once on a real
   SAVED vacancy before the first run.
3. **`resumeFileName`** — the name the PDF should carry when it is uploaded
   (`data/apply-config.json`).

Then run `node .claude/skills/apply-to-jobs/scripts/check-resume.mjs`; it must say
`mode: tailored` and, once one is built, find a PDF in `out/SAVED/`. Any other paths in
`data/apply-config.json` (render scripts, base HTML) are the user's own notes for the agent,
not read by the code — record only what you actually need.

Tell the user in two lines what you found and what a run will do with their repo.

With a single `--resume-file` there is nothing to wire: check the file opens and
move on.

### 4c. Applying: profile and stories

Hand over to the **`profile-interview`** skill: a skeleton profile makes `apply-to-jobs`
stop on every question. Then offer **`import-stories`**: the STAR stories that essay
questions are answered from come from any material they hand over, or it interviews
them.

## 5. Verify

Run the lines for the parts they use:

```sh
python3 .claude/skills/job-triage/sources/linkedin.py ledger      # triage: {"total": 0, ...} for a new repo
python3 .claude/skills/job-triage/triage.py sources               # triage: lists both sources
node .claude/skills/resume-blocks/skills.mjs list --min=4         # resumes: their strongest skills
node .claude/skills/apply-to-jobs/scripts/profile-qa.mjs list     # applying: "No matching qa entries." for a new profile
node .claude/skills/apply-to-jobs/scripts/check-resume.mjs        # applying: which resume mode works
git -C data remote -v                                             # empty, or a private remote you created
```

Tell the user where the data repo is, that it is private, and what comes next:
`/job-triage` for new vacancies, `resume-blocks` for a vacancy they keep,
`apply-method-triage` (to see the queue) or `apply-to-jobs`.

## Migrating from the old single-repo layout

Before the split, the personal files sat in this repo's root and `runs/` beside them.
If a `profile.json` is here (git-ignored now): create the data repo with step 3, then **move** (not copy) `profile.json`, `stories.json`,
`credentials.json`, `apply-config.json`, `runs/` into `data/`, turn old
`runs/<date>-triage.md` files into `data/triage/<date>.md` and drop the `.json` twins,
`git init` and commit. Verify with `profile-qa.mjs list` before deleting anything
from here, and tell the user that this repo's own git history still contains the old
files until they rewrite it.
