---
name: apply-method-triage
description: Triage every SAVED vacancy on OneTap.Work by the method its application demands — Easy Apply inside the job board, an external ATS form an autofill extension can prefill, an external form that must be typed by hand, or an expired posting. Read-only except for archiving dead postings. Writes runs/<date>-triage.md and a machine-readable triage.json. Use when the user asks to triage, categorize or group saved vacancies by how hard they are to apply to, or to plan an apply run before it starts.
---

# Apply-method triage

A fast, read-only survey of the SAVED queue that answers one question per
vacancy: **by what method will this application have to be submitted?**
Nothing here applies to anything, tailors nothing and changes no vacancy
status — except archiving postings that are already dead (step 6).

The axis is the method, not any one tool. Autofill-extension support is a
single signal, used only to separate group 2 from group 3; it must never
appear in a group's name or definition beyond that.

## The four groups

They are **mutually exclusive** and assigned in this order — the first match
wins:

| # | Group | Definition |
|---|---|---|
| 1 | **Easy Apply** | The application is completed **inside the job board itself** — no hop to an employer site. LinkedIn Easy Apply, Indeed Apply, the justjoin.it in-page modal, and anything else where the apply control opens a form in place instead of leaving for another host. |
| 2 | **Extension-assisted** | The application is an **external ATS form** whose host is in the autofill support table (`reference/simplify-supported-ats.md`). Still a real form on a real ATS — the extension only prefills part of it. |
| 3 | **Manual** | An **external form with no autofill support**. Everything gets typed. |
| 4 | **Expired** | The posting is gone — no apply control, or the page says it is no longer accepting applications. Not a way of applying; a cleanup bucket. |

**Why the order matters.** Some vacancies qualify for both 1 and 2 — LinkedIn
and `smartapply.indeed.com` appear in the autofill support table too. Group 1
wins, because where the form lives decides how the run is driven; an extension
is only an aid on top. Never file the same vacancy in two groups, and never
describe group 1 in terms of extension support.

Group 4 is orthogonal to the other three and is decided first in practice — a
dead posting has no application to categorise.

## The classification test

Everything reduces to one question — **where does this vacancy's apply control
lead?** Each possible answer is already a group:

| What the apply destination turns out to be | Group |
|---|---|
| There is none — the form opens in place, on the board | **1** |
| Another host, and it matches the support table | **2** |
| Another host, and it does not | **3** |
| There is no apply control at all, or the page says applications are closed | **4** |

So "no outbound link found" is an answer, not a failure. Group 1 is defined by
the **absence** of a hop, never by guessing which boards have a quick-apply
feature.

## Procedure

### 1. Load the support table

Read `reference/simplify-supported-ats.md` fresh, every run — it is the
extracted list of hosts and URL signatures the autofill extension actually
matches, plus how to regenerate it after an extension update. Do not work from
memory and do not extrapolate from a similar-sounding host.

Three things in it change how matching works, and all three are easy to get
wrong:

- Matching is by **URL pattern**, not by host alone. Several entries match on
  a **path signature on any host** (`gh_jid`, `LeverAppId`, `/CandidateExperience/`,
  `/TGnewUI/`) — that is how an employer's own domain can still be supported.
- Three ATSes (**Teamtailor, Homerun, PhenomPeople**) have no URL patterns at
  all; the extension detects them from page markup. Host-based matching alone
  reports them as unsupported. Treat a recognisable host (`*.teamtailor.com`)
  as group 2, and note the others cannot be resolved without opening the page.
- At triage time the destination is usually a **job page**, while some patterns
  only match the **application step** (`jobs.ashbyhq.com/*/*/application*`).
  Match at host level and treat it as the deliberate approximation it is —
  matching the raw job-page URL against the patterns would file most supported
  ATSes as group 3.

`ats/*.md` under `apply-to-jobs` is **not** the source of truth for support.
Those files hold per-ATS quirks paid for by real runs; the table here is
extracted data. When they disagree, the table wins and the note gets corrected.

### 2. Pull the SAVED queue

`get_my_applications({status: "SAVED", activityStatus: "active", limit: 100})`.

The response is large — easily 1000+ lines. Let it land in its tool-results
file and process that file with `grep` or a short script; do not try to hold it
in context. Extract per vacancy: `vacancyId`, `companyName`, `title`,
`source.kind`, and a `Source: LinkedIn (\d+)` match from `notes` if present.

### 3. Resolve the apply destination — cheapest rung first

This is where the run is won or lost on speed. Four rungs; stop as soon as one
answers.

**Rung 1 — `get_apply_target({vacancyId})`.** Free, no network of ours.
- `kind: "direct"` → this *is* the application URL. Take its host and go
  straight to step 4. No page is opened.
- `kind: "source"` → it is a board posting; continue below.
- **Never print the raw `url` to the user or into a chat reply** — that tool's
  contract forbids it. A bare hostname (no path, no query string) in the report
  file is fine; that is not the protected value.

**Rung 2 — board page, read the link, do not click it.** For a `source` URL,
open the page and read the apply control's `href`:

```json
{"name": "find", "input": {
  "query": "the Apply link's destination URL or hostname (decode the linkedin.com/safety/go redirect if present)",
  "tabId": <tabId>
}}
```

`find` reads the real `href` out of the DOM and decodes LinkedIn's
`/safety/go/?url=...` wrapper — no navigation, no click, no popup. For a board
seen before, a deterministic selector from its `ats/<host>.md` is faster; for
an unfamiliar board, `find` works with no recipe at all. One navigation per
vacancy, zero clicks.

**Rung 3 — follow the hops over HTTP, not in a browser.** When rung 1 or 2
yields an outbound URL that is itself a redirect (aggregator trackers, short
links, employer vanity domains), resolve it with `curl`, which follows a chain
of any depth in one call:

```sh
curl -sL --max-time 12 --max-redirs 15 -A "<a normal desktop UA>" \
     -o /dev/null -w "%{http_code} %{num_redirects} %{url_effective}\n" "$1"
```

Run these in parallel — `xargs -P 12 -n 1` over a **null-delimited** list
(apply URLs contain spaces and parentheses; whitespace-splitting corrupts
them). Measured: 26 URLs resolved in under 3 seconds. Nothing is rendered, no
JS runs, nothing is submitted — it is a plain GET, and only the landing host is
kept.

Better still, capture every hop (`-D -`, read each `Location`) and classify on
the **first recognisable host**: once `greenhouse.io` shows up on hop 2 there
is no reason to walk to the end.

**Rung 4 — a real browser, for the leftovers only.** Fall here when rung 3 
cannot answer, and only then:
- `403` or a challenge page (bot protection — SmartRecruiters does this);
- the landing host looks like a login wall (`curl` carries no session cookies,
  so a gated board redirects to sign-in and would be recorded as the wrong
  host);
- a `<meta refresh>` or a JS-driven hop, which `curl` does not follow.

Navigate — never click the apply control. Up to **10 tabs in parallel** is
fine here; by history this rung handles single vacancies, not dozens.

### 4. Classify

Apply the group order from § The four groups. Record for each vacancy:
`vacancyId`, company, title, group, the resolved host (bare hostname), the ATS
product if identifiable, which rung answered, and a one-line reason.

Identify the ATS from the domain where it is unambiguous (`*.myworkdayjobs.com`
= Workday, `smrtr.io` = SmartRecruiters' shortener, `*.recruitee.com` =
Recruitee, `*.jobs.personio.com` = Personio, `*.ocs.oraclecloud.com` = Oracle
Recruiting Cloud, `jobs.lever.co` = Lever). Do not treat a URL parameter that
merely resembles a signature as proof — the extension keys on `gh_jid`
specifically, and `gh_src` is not the same thing. Say a host is unverified
rather than asserting it.

### 5. Write the output

Two files, same directory, same run:

`runs/<today's date>-triage.md` — for a person to read:
- one-line counts summary at the top;
- a section per group, in order 1, 2, 3, then 4, each a table of
  Company / Title / Resolved host / ATS / link;
- flag ⚠️ on any group-2 row whose ATS needs a candidate account before it will
  accept an application (Workday, Avature);
- a short methodology footer: the date, which rung answered how many, and the
  extension version the support table was extracted from.

`runs/<today's date>-triage.json` — for `apply-to-jobs` to consume: one object
per vacancy with the fields from step 4, so a later run reads the group instead
of re-deriving it or parsing markdown.

### 6. Archive the expired ones without asking

Group 4 is not a judgment call. `bulk_update_applications` with
`status: "ARCHIVED"` and a note like `"<date>: expired on <host> — never
applied, found during triage."` Use `ARCHIVED`, not `NOT_INTERESTED` — that
status means "actively dismissed", which is not what happened. Ask before any
other status change; this one cleanup is safe to just do.

## Pitfalls learned the hard way

- **Never click an apply control to find out where it goes.** Clicking
  (synthetic `.click()`, a real `computer` click, even a trusted click on an
  element `ref`) can hang the tab for 30+ seconds on LinkedIn's redirect-shim,
  or pop an extension sidebar open instead, or land the new tab outside the
  automated tab group. A `javascript_tool` read of `a.href` gets redacted as
  token-like data. Reading the `href` with `find` avoids all of it.
- **The browser is the slow rung, so use it last.** A navigation costs seconds;
  an HTTP hop costs milliseconds. Speed comes from not opening tabs, not from
  opening more of them in parallel.
- **LinkedIn degrades under rapid automated loads.** After dozens of
  back-to-back navigations, pages start hanging on `document_idle` or script
  injection. Recover by navigating to a **different** domain first, then back —
  a same-URL retry often stays stuck. If it repeats, slow down rather than
  retrying the stuck call. This is the real reason rung 3 exists.
- **`browser_batch` aborts the whole batch on the first error.** Keep chunks
  small (~4 vacancies) so one flaky page does not waste the rest.
- **A `fork` subagent is not reliable for the browsing pass.** Two attempts
  returned instantly with zero tool calls and no output — a launch failure that
  only showed up because the report file was never written. Do it in the main
  session, or a `general-purpose` subagent with its own context, and verify the
  output file exists before reporting done.
- **`get_my_applications` on a full queue is too big for context.** Process the
  tool-results file, do not read it inline.
