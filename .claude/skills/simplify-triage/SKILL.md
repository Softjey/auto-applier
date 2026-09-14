---
name: simplify-triage
description: Classify every SAVED vacancy on OneTap.Work by whether the Simplify Copilot Chrome extension will help fill its application form — LinkedIn Easy Apply, a known-supported ATS, an unverified/unsupported host, or already closed. Writes the result to runs/<date>-simplify-triage.md. Use when the user asks to triage saved vacancies for Simplify, check which saved jobs Simplify can help with, or plan a Simplify-first apply run before it starts.
---

# Simplify triage

A fast, read-only survey of the SAVED queue: which vacancies the **Simplify
Copilot** Chrome extension (see `.claude/skills/apply-to-jobs/SKILL.md` §
Simplify fast path) can likely autofill, and which need a fully manual form
fill. Nothing here applies to anything or changes any vacancy's status except
the optional cleanup step at the end — it only reads and writes one report
file.

## Why this needs its own procedure, not ad-hoc browsing

Most SAVED vacancies are `USER_CREATED` (added from LinkedIn), and
OneTap.Work only stores the LinkedIn posting as their source — never the
employer's real ATS link (`get_apply_target` returns `kind: "source"` for
these, not `kind: "direct"`). The real application host is not shown on the
page and clicking "Apply" to find out is slow and can hang (see the pitfall
below) — but it doesn't need to be clicked at all: the destination is already
sitting in the link's `href`, wrapped by LinkedIn's own `/safety/go/?url=...`
redirect-shim, and the `find` tool reads and decodes it directly. This
skill's whole point is doing that survey efficiently and safely, resolving
every real ATS host without ever clicking through 50+ redirect chains.

## Procedure

1. **Load the known-support table fresh, every run** — it's not memorized,
   it can grow: `grep -l "## Simplify" .claude/skills/apply-to-jobs/ats/*.md`,
   then read a few lines under that heading in each hit. This is the ground
   truth for which hosts Simplify is confirmed to work on vs. confirmed not
   to (e.g. as of 2026-09-14: supported — SmartRecruiters, Greenhouse, Ashby,
   Comeet, BambooHR, Workday/`myworkdayjobs.com`; not supported — Traffit,
   join.com, Oracle Recruiting Cloud, Personio, Spott, Salesforce-hosted
   sites, employer-built forms). Anything not covered stays "untested", never
   guessed.

2. **Pull the SAVED queue**: `get_my_applications({status: "SAVED",
   activityStatus: "active", limit: 100})`. This response is large (easily
   1000+ lines) — it will get written to a tool-results file; don't try to
   hold all of it in context. Use `grep`/a short Python/Node script over that
   file, or a `fork` subagent, to extract per vacancy: `vacancyId`,
   `companyName`, `title`, `source.kind`, and — from the `notes` field — a
   `Source: LinkedIn (\d+)` match if present.

3. **Resolve a LinkedIn ID for every vacancy that doesn't already have one in
   its notes.** Call `get_apply_target({vacancyId})` for each. It returns
   `{url, kind}`:
   - `kind: "direct"` → this *is* the real ATS form. Take the host straight
     from `url` — no LinkedIn hop needed for this one.
   - `kind: "source"` and `url` matches `linkedin.com/jobs/view/<id>` →
     record the id, handle in step 4.
   - `kind: "source"` pointing elsewhere (a different job board, e.g.
     nofluffjobs.com, a Lever/`jobs.lever.co` posting, justjoin.it, etc.) →
     record that host directly; it needs no LinkedIn hop either, but its
     Simplify support is whatever step 1's table says (usually "untested" —
     don't extrapolate from a similar-sounding host).
   - **Never print the raw `url` to the user or put it in a chat reply** —
     `get_apply_target`'s own contract forbids that. It's fine to write a
     bare hostname (no path, no query string) into the report file; that is
     not the protected value.

4. **For every LinkedIn-sourced vacancy, resolve the real host — do not
   click Apply, read its `href` instead.** Batch this with `browser_batch`,
   reusing one tab, in chunks of ~4 vacancies (8 actions: `navigate` + a
   `find` call) per call — `browser_batch` aborts the whole batch on the
   first error, so keep chunks small enough that one flaky page doesn't
   waste the rest. Per vacancy:

   ```json
   {"name": "find", "input": {
     "query": "the Apply link's destination URL or hostname (decode the linkedin.com/safety/go redirect if present)",
     "tabId": <tabId>
   }}
   ```

   `find` reads the element's real `href` from the DOM and decodes the
   `url=` query parameter of LinkedIn's `/safety/go/?url=...` wrapper for
   you — no navigation, no click, no popup, no redirect chain to wait out.
   Interpret the result:
   - No Apply/Easy-Apply element found, and the page text says "not
     currently accepting applications" / "no longer accepting applications"
     → **already closed** on LinkedIn, regardless of what OneTap.Work's
     `activityStatus` says. Flag for cleanup in step 6.
   - The matching element is an "Easy Apply" control with no external href
     → **LinkedIn Easy Apply**. The form is inside LinkedIn itself —
     Simplify's best-documented, flagship use case. Bucket as "Simplify
     likely helps", not "confirmed" (there's no `ats/linkedin.com.md` yet —
     the first real run through one should create it, per the apply-to-jobs
     Simplify fast path's own "add to it when you learn" rule).
   - A decoded destination URL comes back → take its hostname and look it up
     against step 1's table:
     - host is in the *supported* list → **confirmed Simplify helps**
       (note if it's a Workday host — those need a candidate account first,
       flag that caveat).
     - host is in the *not supported* list → **confirmed Simplify won't
       help**, full manual fill.
     - host isn't in the table at all → **host known, Simplify untested**.
       Note the ATS product if you can identify it from the domain (e.g.
       `*.myworkdayjobs.com` = Workday, `smrtr.io` = SmartRecruiters'
       shortener, `*.recruitee.com` = Recruitee, `*.jobs.personio.com` =
       Personio, `*.ocs.oraclecloud.com` = Oracle Recruiting Cloud,
       `*.hibob.com` = HiBob, `jobs.lever.co` = Lever) — but don't guess
       Simplify support for it, and don't assume a URL param that merely
       *looks* like an ATS's signature (e.g. a `gh_src` query param) proves
       it's that ATS; say so is unverified rather than asserting it.

5. **Write the report** to `runs/<today's date>-simplify-triage.md` (create
   `runs/` if the very first run predates it — it shouldn't). Sections, in
   this order:
   - One-line counts summary at the top.
   - "Confirmed: Simplify will help" — resolved hosts matching step 1's
     supported list (Workday ones flagged ⚠️ needs an account).
   - "LinkedIn Easy Apply — Simplify likely helps".
   - "Confirmed: Simplify will NOT help" — resolved hosts matching step 1's
     not-supported list, with the reason per row.
   - "Host resolved, Simplify untested" — real ATS known, no data yet on
     whether Simplify works there.
   - "Already closed — archived" — the cleanup candidates from step 4, once
     step 6 has actually archived them.
   - A short "Methodology" footer noting the date and the `find`-based
     resolution method.

6. **Archive the closed ones without asking** — they're not a judgment call,
   they're dead: `bulk_update_applications` with `status: "ARCHIVED"` and a
   note like `"<date>: expired on LinkedIn — never applied, found during
   Simplify triage."` for every vacancy flagged `closed` in step 4. (Use
   `ARCHIVED`, not `NOT_INTERESTED` — that status means "actively
   dismissed," which isn't what happened here.) Do ask before anything else
   that changes vacancy status; this one cleanup is safe to just do.

## Pitfalls learned the hard way

- **A `fork` subagent is not reliable for this.** Two attempts at delegating
  the whole browsing pass to a background fork both returned instantly with
  zero tool calls and no output — a launch failure, not a real attempt, and
  it wasn't obvious until checking that the report file never got written.
  Do the browsing directly in the main session (or a `general-purpose`
  subagent with its own fresh context, not a `fork`, if delegating at all),
  and verify the output file actually exists before trusting a "done" report.
- **Don't click an off-site "Apply" control to find the real host — read its
  `href` instead.** Clicking it (synthetic `.click()`, a real `computer`
  click, even a trusted click via an element `ref`) can hang the tab for
  30+ seconds: sometimes it routes through LinkedIn's redirect-shim
  (`/safety/go/...`) and never resolves to a readable URL in the automated
  tab, sometimes it instead pops the **Simplify Copilot** sidebar open right
  there on the LinkedIn page (worth knowing: Simplify hooks the LinkedIn
  Apply click itself, not just the destination ATS — so it may cover more of
  this off-site bucket than the destination-host lookup alone suggests, but
  don't rely on triggering that panel for the triage; it's slow and not
  needed). Either way, a `javascript_tool` read of `a.href` on that link also
  gets redacted (`[BLOCKED: ...]`) because it looks like it carries a
  token/query string. None of that is necessary: the `find` tool reads the
  same `href` straight from the DOM and decodes LinkedIn's `url=` wrapper
  without navigating anywhere, in one call, every time.
- **LinkedIn can start acting up after a lot of rapid automated page loads in
  one session** (dozens of `navigate` calls back to back) — pages that
  loaded fine earlier can start hanging on `document_idle` or on script
  injection. If a `navigate`/`find`/screenshot call times out, `navigate` to
  a **different** domain first to force the tab to recover, then go back to
  the LinkedIn URL — a same-URL `navigate` alone may still be stuck. If it
  keeps happening, slow down (smaller `browser_batch` chunks, or pause
  between chunks) rather than retrying the same stuck call.
- **`get_my_applications({status:"SAVED", limit:100})` on a full queue is
  too big for context.** Let it land in its tool-results file and process
  that file with `grep`/a script instead of reading it inline.
