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
these, not `kind: "direct"`). The real application host is only visible once
LinkedIn's Apply control is used, and following that hand-off is slow and
occasionally hangs (see the pitfall below). This skill's whole point is doing
that survey efficiently and safely, without clicking through 50+ redirect
chains.

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

4. **For every LinkedIn-sourced vacancy, open the posting read-only — do not
   click Apply.** Batch this with `browser_batch`, reusing one tab, in chunks
   of ~5 vacancies (10 actions: `navigate` + a `javascript_tool` check) per
   call — `browser_batch` aborts the whole batch on the first error, so
   keep chunks small enough that one flaky page doesn't waste the rest. Per
   vacancy:

   ```js
   const btns=[...document.querySelectorAll('button,a')].map(b=>b.innerText.trim());
   JSON.stringify({
     easy: btns.some(t=>/Easy Apply/i.test(t)),
     apply: btns.some(t=>/^Apply$/i.test(t)),
     offsite: /managed off LinkedIn/i.test(document.body.innerText),
     closed: /no longer accepting|no longer being accepted/i.test(document.body.innerText)
   })
   ```

   Classify each:
   - `closed: true` → **already closed** on LinkedIn, regardless of what
     OneTap.Work's `activityStatus` says. Flag for cleanup in step 6.
   - `easy: true` → **LinkedIn Easy Apply**. The form is inside LinkedIn
     itself — Simplify's best-documented, flagship use case. Bucket as
     "Simplify likely helps", not "confirmed" (there's no `ats/linkedin.com.md`
     yet — the first real run through one should create it, per the apply-to-jobs
     Simplify fast path's own "add to it when you learn" rule).
   - `offsite: true` (whether or not `apply` matched exactly — some postings
     use a different label than the literal word "Apply") → **host unknown**.
     Do not click through to find out. A single test of clicking an off-site
     Apply control hung 30+ seconds on LinkedIn's own `/safety/go/`
     redirect-shim without resolving — multiply that by every such vacancy
     and the triage stops being fast. Bucket as "needs manual — ATS unknown
     until a real apply run opens it" (that happens naturally in the
     apply-to-jobs skill's own Phase 1 liveness probe, so nothing here is
     wasted, only deferred).

5. **Write the report** to `runs/<today's date>-simplify-triage.md` (create
   `runs/` if the very first run predates it — it shouldn't). Sections, in
   this order:
   - One-line counts summary at the top.
   - "Simplify likely helps" — LinkedIn Easy Apply entries, plus any vacancy
     whose resolved host is in step 1's *supported* list.
   - "Needs manual — ATS unknown or unverified" — off-LinkedIn vacancies with
     no confirmed host, plus any resolved host that is in step 1's table but
     marked *not supported* or not in the table at all (say which of the two
     it is, per row or per group).
   - "Already closed but still SAVED" — the cleanup candidates from step 4.
   - A short "Methodology" footer noting the date and that off-site hosts
     were intentionally not chased individually (see step 4's reasoning).

6. **Offer the cleanup**, don't do it unasked: if any vacancies came back
   `closed: true`, tell the user how many and offer to
   `update_application_status({vacancyId, status: "NOT_INTERESTED", notes:
   "<date>: closed on LinkedIn, never applied — found during Simplify
   triage."})` for them. Only do it if they say yes.

## Pitfalls learned the hard way

- **A `fork` subagent is not reliable for this.** Two attempts at delegating
  the whole browsing pass to a background fork both returned instantly with
  zero tool calls and no output — a launch failure, not a real attempt, and
  it wasn't obvious until checking that the report file never got written.
  Do the browsing directly in the main session (or a `general-purpose`
  subagent with its own fresh context, not a `fork`, if delegating at all),
  and verify the output file actually exists before trusting a "done" report.
- **Don't click an off-site "Apply" control to find the real host.** It
  routes through LinkedIn's own redirect-shim (`/safety/go/...`) which can
  hang the tab for 30+ seconds without ever resolving to a readable URL, and
  a `javascript_tool` read of `a.href` on that link gets redacted anyway
  (`[BLOCKED: ...]`) because it looks like it carries a token/query string.
  Reading the button's visible label (`Easy Apply` vs plain `Apply` +
  "managed off LinkedIn" phrasing) is cheap, reliable, and enough to sort
  vacancies into the right bucket without ever needing the real URL.
- **`get_my_applications({status:"SAVED", limit:100})` on a full queue is
  too big for context.** Let it land in its tool-results file and process
  that file with `grep`/a script instead of reading it inline.
