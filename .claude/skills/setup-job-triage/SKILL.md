---
name: setup-job-triage
description: Create the user's private data repo for job triage — the separate git repository that holds their criteria.md, the saved LinkedIn search, the ledger of judged jobs and the triage reports — and point this code repo at it. Use on a fresh clone, when any script reports "No data repo found", or when the user says "set me up", "create my data repo", "I just cloned job-triage".
---

# Set up the data repo

This repo is code and generic knowledge; it holds nothing about any one person.
Everything personal — `criteria.md`, `linkedin/filters.json`,
`linkedin/ledger.json`, `linkedin/session.json`, `triage/` — lives in a
**private data repo**, reached as `data/` at the root of this repo. This skill creates that repo so the triage
skills have somewhere to read and write. Do it once per user; it is safe to
re-run, because it refuses to overwrite.

## 1. Check what exists

```sh
ls -la data/criteria.md
```

- It exists → set up. Say so, show where `data` points, and offer to review
  `criteria.md` with the user. Stop.
- No such file → continue.

## 2. Ask three things, in one message

1. **Where should it live?** Default `data/` inside this repo (git-ignored),
   nothing to configure. If they already have a private data repo, they clone it
   into `data/` instead and this step ends. Anywhere outside this repo works too:
   the script then makes `data` a symlink to it and allows that folder once in
   `.claude/settings.local.json`.
2. **Should it have a remote?** Only ever a **private** one, and only if they want
   off-machine backup. Never create or add a public remote: the repo will hold a
   salary floor, company decisions and a record of every job they rejected.
   Creating any remote is the user's call — ask, and do nothing if they do not
   say yes.
3. **Will they use LinkedIn?** Reading LinkedIn needs no account. Saving and
   dismissing jobs there needs their cookies in `linkedin/session.json`, and
   automating a logged-in session can get an account restricted. Default is no.

## 3. Create it

```sh
python3 .claude/skills/job-triage/init_data_repo.py [--dir=<path>]
```

It copies `templates/data-repo/` (a blank `criteria.md`, `linkedin/filters.json`,
an empty `linkedin/ledger.json`, `README.md`, `.gitignore`, an empty `triage/`),
runs `git init` with one commit, and, for a `--dir` elsewhere, links `data` to it
and adds the folder to `permissions.additionalDirectories` in
`.claude/settings.local.json`. It refuses a directory inside this repo other than
`data/`, and one that already has a `criteria.md`.

If they asked for a remote: `gh repo create <name> --private --source=data --push`
— after confirming the exact name and that it is private.

## 4. Fill `criteria.md`

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

## 5. Fill the LinkedIn search

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

## 6. Verify

```sh
python3 .claude/skills/job-triage/sources/linkedin.py ledger   # {"total": 0, ...} is right for a new repo
python3 .claude/skills/job-triage/triage.py sources            # lists both sources
git -C data remote -v                                          # empty, or a private remote you created
```

Tell the user where the data repo is, that it is private, and that the next step
is `/job-triage`.
