---
name: apply-method-triage
description: Triage every SAVED vacancy on OneTap.Work by the method its application demands — a form the repo's own autofill extension fills, Easy Apply inside the job board, an external ATS form the Simplify extension can prefill, an external form that must be typed by hand, or an expired posting. Read-only except for archiving dead postings. Writes one readable Markdown report, triage/<date>.md, in the user's data repo. Use when the user asks to triage, categorize or group saved vacancies by how hard they are to apply to, or to plan an apply run before it starts.
---

# Apply-method triage

A fast, read-only survey of the SAVED queue that answers one question per
vacancy: **by what method will this application have to be submitted?**
Nothing here applies to anything, tailors nothing and changes no vacancy
status — except archiving postings that are already dead (step 6).

The axis is the method, not any one tool. Two autofill extensions exist and they are
told apart by the **group**, never by anything else: the repo's **own** extension
(`autofill/`) is group 1, and Simplify's table only separates group 3 from group 4.

## The five groups

They are **mutually exclusive** and assigned in this order — the first match
wins:

| # | Group | Definition |
|---|---|---|
| 1 | **Own extension** | The application is a form **the repo's own autofill extension** (`autofill/`) fills: the apply destination matches one of its adapters (today Traffit, eRecruiter, justjoin.it — read the adapters, see step 1). It applies to an in-page board form (the justjoin.it modal) exactly as to an external ATS (Traffit, eRecruiter): once the extension drives the form, *where the form lives* no longer decides how the run goes. |
| 2 | **Easy Apply** | The application is completed **inside the job board itself** and no own adapter covers it — no hop to an employer site. LinkedIn Easy Apply, Indeed Apply, and anything else where the apply control opens a form in place instead of leaving for another host. |
| 3 | **Simplify-assisted** | The application is an **external ATS form** whose host is in the Simplify support table (`reference/simplify-supported-ats.md`). Still a real form on a real ATS — the extension only prefills part of it. |
| 4 | **Manual** | An **external form that neither extension supports**. Everything gets typed. |
| 5 | **Expired** | The posting is gone — no apply control, or the page says it is no longer accepting applications. Not a way of applying; a cleanup bucket. |

**Why the order matters.** Overlaps are real and the order settles them:

- Own extension over **Easy Apply**: justjoin.it is an in-page modal, so by the old
  "where the form lives" rule it was Easy Apply; it is group 1 now because the own
  adapter fills it. A board with an in-page form and *no* adapter is still group 2.
- Own extension over **Manual**: Traffit and eRecruiter have no Simplify support, so
  they used to land in Manual; they are group 1 now.
- Easy Apply over **Simplify-assisted**, as before: LinkedIn and
  `smartapply.indeed.com` are in Simplify's table too, but where the form lives decides
  how the run is driven, and Simplify is only an aid on top.

Never file the same vacancy in two groups. Group 5 is orthogonal to the rest and is
decided first in practice — a dead posting has no application to categorise.

**Adding an adapter moves vacancies.** When a new adapter lands in
`autofill/packages/extension/src/adapters/`, hosts that were group 2/3/4 become group 1 on
the next triage with no edit to this skill — that is why step 1 reads the adapters
instead of a list kept here.

## The classification test

Everything reduces to one question — **where does this vacancy's apply control
lead?** Each possible answer is already a group:

| What the apply destination turns out to be | Group |
|---|---|
| A host (board or external) that one of the own adapters matches | **1** |
| There is none — the form opens in place, on the board, and no adapter matches | **2** |
| Another host, and it matches the Simplify table | **3** |
| Another host, and it matches neither extension | **4** |
| There is no apply control at all, or the page says applications are closed | **5** |

So "no outbound link found" is an answer, not a failure. Group 2 is defined by
the **absence** of a hop, never by guessing which boards have a quick-apply
feature.

## Procedure

### 1. Load both support tables

**The own adapters — read them fresh, every run.** They are the source of truth and
there is deliberately no copy of them here:

```sh
grep -h "matchPatterns" <code repo>/autofill/packages/extension/src/adapters/*.ts
```

Each adapter lists the URL patterns it is injected on (`matchPatterns`) and a
`matches(url)` predicate for the page that carries the form. At triage time the
destination is usually an offer or description page, so match at **host level**, a
deliberate approximation: `*.traffit.com` counts although only `/public/form/…` holds the
form (`/public/an/…` is the description that links to it); `skk.erecruiter.pl/Offer.aspx`
counts because its Apply leads to `form.erecruiter.pl`; `justjoin.it/job-offer/…` counts
because its Apply opens the modal the adapter fills. An adapter's own `ats/<host>.md`
note says where it is known to fall short.

**Simplify's table.** Read `reference/simplify-supported-ats.md` fresh, every run — it is
the extracted list of hosts and URL signatures the Simplify extension actually
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
  as group 3, and note the others cannot be resolved without opening the page.
- At triage time the destination is usually a **job page**, while some patterns
  only match the **application step** (`jobs.ashbyhq.com/*/*/application*`).
  Match at host level and treat it as the deliberate approximation it is —
  matching the raw job-page URL against the patterns would file most supported
  ATSes as group 4.

Check the own adapters **first**: a host both tables know is group 1.

`ats/*.md` under `apply-to-jobs` is **not** the source of truth for support.
Those files hold per-ATS quirks paid for by real runs; the adapters and the table are
code and extracted data. When they disagree, they win and the note gets corrected.

### 2. Pull the SAVED queue

`get_my_applications({status: "SAVED", activityStatus: "active", limit: 100})`.

The response is large — easily 1000+ lines. Let it land in its tool-results
file and process that file with `grep` or a short script; do not try to hold it
in context. Extract per vacancy: `vacancyId`, `companyName`, `title`,
`vacancy.link`, `source.kind`, and a `Source: LinkedIn (\d+)` match from
`notes` if present. `vacancy.link` is the onetap.work page — copy it verbatim,
never build it from the id; it is what every report row links to (step 5).

### 3. Resolve the apply destination — cheapest rung first

This is where the run is won or lost on speed. Four rungs; stop as soon as one
answers.

**Rung 1 — `get_apply_target({vacancyId})`.** Free, no network of ours.
- `kind: "direct"` → this *is* the application URL. Take its host and go
  straight to step 4. No page is opened. (A `direct` host an own adapter matches —
  Traffit, eRecruiter — is group 1.)
- `kind: "source"` → it is a board posting. **If its host is one an own adapter matches
  (justjoin.it today), it is group 1 — stop here, open nothing.** Otherwise continue below.
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

Apply the group order from § The five groups. Record for each vacancy:
`vacancyId`, company, title, `link`, group, the resolved host (bare hostname),
the ATS product if identifiable, which rung answered, and a one-line reason.

Identify the ATS from the domain where it is unambiguous (`*.myworkdayjobs.com`
= Workday, `smrtr.io` = SmartRecruiters' shortener, `*.recruitee.com` =
Recruitee, `*.jobs.personio.com` = Personio, `*.ocs.oraclecloud.com` = Oracle
Recruiting Cloud, `jobs.lever.co` = Lever). Do not treat a URL parameter that
merely resembles a signature as proof — the extension keys on `gh_jid`
specifically, and `gh_src` is not the same thing. Say a host is unverified
rather than asserting it.

### 5. Write the output

One file: **`$DATA/triage/<today's date>.md`**, where `$DATA` is the user's private
data repo (resolve it with `lib/data-dir.mjs`, see `apply-to-jobs` § Configuration).
Triage is a report, not a run, so it never goes under `runs/`. There is no JSON
twin: nothing consumes one, and a second copy only drifts. A later run reads the
report or simply re-derives the group.

If the same day already has a report, write `<date>-2.md` rather than overwriting.

Layout:
- `# SAVED triage — <date>`, then a one-line counts summary (Own extension N, Easy Apply N,
  Simplify-assisted N, Manual N, Expired N);
- a section per group, in order 1, 2, 3, 4, then 5, each a table of
  Company / Title / Resolved host / ATS / Reason, where **Title is a markdown
  link to the vacancy's `link`** (`[Senior Frontend](https://onetap.work/job/…)`).
  Every row, every group — unresolved and expired ones included. A row the user
  cannot click through is a row they have to go and look up by hand. The link is
  always `vacancy.link`, never the `get_apply_target` URL;
- flag ⚠️ on any group-3 row whose ATS needs a candidate account before it will
  accept an application (Workday, Avature);
- a short methodology footer: the date, which rung answered how many, the own
  adapters that were live (their ids), and the Simplify version the support table was
  extracted from.

**Keep the tables valid Markdown.** A literal `|` inside a cell ends the cell and
shifts every column after it — and job titles are full of them
(`Frontend Engineer | React + Next.js`). Escape every pipe in any cell as `\|`
(including inside the link text), collapse newlines to spaces, and keep each row on
one line. Before finishing, check that every row of a table has as many cells as
its header; fix the row, never the header.

### 6. Archive the expired ones without asking

Group 5 is not a judgment call. `bulk_update_applications` with
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
- **justjoin.it's Apply is not always the in-page modal.** Some offers' Apply opens the
  employer's own ATS in a new tab instead (Miquido's opened BambooHR — see
  `ats/justjoin.it.md`). Both variants present the same `kind: "source"` URL and a plain
  `<button>`, and the only way to tell is to click — which this skill never does. Triage
  therefore files every justjoin.it offer as group 1 and says so in the row's reason
  ("modal assumed; an offer with an external ATS is only found out at apply time"). The
  apply run corrects it by looking at where the click lands.
