---
name: organize-by-status
description: Sort vacancy folders in data/out/ (or another folder of generated resumes) into per-status subfolders (SAVED, APPLIED, REJECTED, NOT_INTERESTED, ...) based on their onetap application status. Use when the user asks to organize/sort/split vacancy folders by status.
---

# Organize vacancy folders by status

This skill moves folders, it does not decide their status — the status always comes from the
`onetap` MCP tools, never guessed from the folder name or CV content. Moving files is the risky
part, so it is done by a small script (`organize.mjs`) that dry-runs by default, never overwrites,
never deletes, and leaves anything it can't confidently classify exactly where it was.

## Folder name shapes

A vacancy folder is one of:

- `<Company>_<vacancyId>-<Title-slug>` — has a onetap vacancy id (a ~25-char cuid after the `_`).
- `<Company>-<Title-slug>` — no id (typically a custom vacancy added outside onetap.work, e.g. via
  `create_custom_vacancy`). These can only be matched by company/title text search.

## Procedure

1. **Make sure `.env.local` exists** with a live onetap session:
   `.claude/skills/organize-by-status/.env.local` → `ONETAP_SESSION_ID=<value>` (gitignored,
   never commit it, never print it). If missing or the fetch script reports an auth error (401/403
   — the session expired), ask the user for a fresh `sessionId` cookie value from their logged-in
   browser session on onetap.work (DevTools → Application → Cookies) and rewrite that file.

2. **Run the fetch script** — it talks to the onetap API directly (see "How status-fetching
   works" below), no MCP round-trips needed:
   ```bash
   node .claude/skills/organize-by-status/fetch-statuses.mjs --dir=data/out --out=/tmp/mapping.json
   ```
   This resolves every id-bearing folder (`<Company>_<vacancyId>-<Title>`) exactly, in seconds,
   via one direct API call per vacancy id. It also attempts the id-less folders (custom vacancies,
   named just `<Company>-<Title>`) via a free-text company search with basic title-word scoring —
   this part is a heuristic and can pick the wrong record when a company has several similar
   postings (duplicates, near-duplicates). Treat anything it reports as "resolved" for an id-less
   folder as a first draft, not ground truth.

3. **Sanity-check the id-less resolutions** the script made, and fix any it reports as unmatched
   or got wrong. For a handful of folders this needs a real judgment call — when several postings
   at the same company are genuinely similar, pick by title-slug match and by reading `notes` on
   the candidate applications (e.g. "duplicate of X, kept as Y") rather than trusting word overlap
   alone. Use `mcp__onetap__get_my_applications` with `query=<company>` to inspect candidates the
   same way the fetch script's `listApplications` does. Edit the `byFolder` section of the mapping
   file directly for anything you correct or add.

4. **Mapping file shape** (scratchpad, not the repo):
   ```json
   {
     "byId":     { "cmtywlyk2004ls00em9mo14r1": "NOT_INTERESTED", "...": "APPLIED" },
     "byFolder": { "airSlate-Senior-Fullstack-Engineer-AI": "APPLIED" }
   }
   ```
   Every folder in `data/out/` should end up as a key in one of the two maps — if a handful genuinely
   can't be resolved, that's fine, `organize.mjs` reports them and leaves them alone.

5. **Dry-run the mover** and show the plan before touching anything:
   ```bash
   node .claude/skills/organize-by-status/organize.mjs --map=/path/to/mapping.json --dir=data/out
   ```
   Review the per-status counts, and especially the "unmatched" and "conflicts" sections.

6. **Apply**, only after the dry run looks right (or the user has confirmed it):
   ```bash
   node .claude/skills/organize-by-status/organize.mjs --map=/path/to/mapping.json --dir=data/out --apply
   ```

7. **Report** what moved where, and call out anything left unmatched (with a suggestion of why —
   usually a custom vacancy whose company/title didn't match any application record).

## How status-fetching works

`fetch-statuses.mjs` and `onetap-client.mjs` call the onetap.work API directly
(`api.onetap.work`, per github.com/Softjey/vacancies_tracker) — the same operations as the
`mcp__onetap__*` tools, but as plain HTTP so the whole id-based lookup runs in a couple of
seconds instead of many manual MCP calls:

- `GET /vacancies/:vacancyId/applications/my` — one direct lookup per vacancy id, run with
  bounded concurrency (`mapWithConcurrency`, default 8 at a time).
- `GET /applications?query=<text>` — free-text search, used for the id-less folders.

Auth is a **session cookie**, not an API key — `Cookie: sessionId=<value>`, read from
`ONETAP_SESSION_ID` (env var, or the gitignored `.env.local` next to these scripts). This cookie
belongs to the user's own onetap.work login; it is scoped to their account like any browser
session and expires like one. Never print its value, never write it anywhere but `.env.local`,
and never commit that file.

## Why a script instead of `mv`-ing by hand

Hand-moving dozens of folders one command at a time is slow and error-prone under a large context
(easy to typo a path, silently overwrite, or lose track of what's already been moved). The script
makes the move step mechanical and safe: it always dry-runs first, is idempotent (re-running after
a partial apply just picks up what's left), and only source data (the mapping file) needs review —
never the moving logic itself.
