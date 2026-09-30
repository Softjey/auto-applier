# Simplify Copilot — the real supported-ATS list

**Provenance.** Extracted from the extension's own `remoteConfig.json`, not
from marketing copy: Simplify's public docs claim "80% of job application
websites" / "100+ ATS" and name no hosts. `remoteConfig.json` is the table the
autofill engine actually matches against.

- Extension: `Simplify Copilot`, Chrome id `pbanhockgagggenencehbnadejlgchfc`
- Version read: **3.1.6** (2026-09-16)
- Re-verified **2026-09-30**: the installed 3.1.6 config matches this table exactly (56 ATS
  entries, every URL pattern, every exclusion, the embedded-detection column and the four
  boards). The newest published build, **3.1.7**, was downloaded from the Chrome Web Store
  update endpoint (sha256 `57c445a1…8db9363`, matching the server's hash) and its
  `remoteConfig.json` diffed against 3.1.6: **no ATS entry changed** — same 57 keys, same
  `urls`, `urlsExcluded`, `pathsExcluded` and `embeddedPaths`. Only the LinkedIn board's
  `minFetchTime` (6000 -> 750) and four feature flags differ, none of which affect which
  pages count as supported.
- Path: `~/Library/Application Support/Google/Chrome/<profile>/Extensions/<id>/<version>/remoteConfig.json`
- The extension loads it with `fetch(runtime.getURL("remoteConfig.json"))` —
  **from disk, not from a server**. So this table only changes when the
  extension itself updates. Re-extract after a version bump; don't assume it
  drifted in between.
- `manifest.json` matches `*://*/*` and requests `host_permissions: *://*/*`,
  so the manifest says nothing about coverage — the content script runs
  everywhere and decides per page from this config.

## How a page is matched — three mechanisms, not one

Host-based lookup alone under-reports. A page counts as supported if **any** of
these hits:

1. **Host + path URL pattern** — the common case (`urls`), Chrome
   match-pattern syntax. Note it is host *and path*: `*.myworkdayjobs.com/*`
   matches anything on the host, but `jobs.ashbyhq.com/*/*/application*`
   matches only the application step.
2. **Path-only signature** (`*://*/<path>`) — matches on **any** host,
   including an employer's own domain. This is how white-labelled tenants are
   caught. See the table below.
3. **DOM-only detection** (`embeddedPaths`, no `urls` at all) — the config
   holds XPaths for markers in the page. Three ATSes are detected this way and
   are invisible to any host-based check: **Teamtailor, Homerun, PhenomPeople**.
   `embeddedPaths` also augments several URL-matched entries (Greenhouse,
   AshbyHQ, Avature, Recruitee, PinpointHQ, Polymer) so an embedded iframe of
   them is recognised on a foreign host.

## Path-only signatures (match on ANY host)

| ATS | path signature |
|---|---|
| BrassRing | `/TGNewUI/Profile/Home/ProfileBuilder*` |
| BrassRing | `/TGNewUI/Search/Home/Home*` |
| BrassRing | `/TGNewUI/Search/home/Home*` |
| BrassRing | `/TGnewUI/Search/Home/Home*` |
| BrassRing | `/TGnewUI/Search/home/Home*` |
| Greenhouse | `/**gh_jid**` |
| Lever | `/*?LeverAppId=*` |
| OracleCloud | `/*/CandidateExperience/*/sites/*/*/preview/*` |
| OracleCloud | `/*/CandidateExperience/*/sites/*/job/*` |
| OracleCloud | `/*/sites/*/jobs/preview/*/apply/*` |
| OracleCloud | `/*/sites/CX*/job/*` |

This is why an employer's own careers domain can still be autofilled: a
Greenhouse-embedded page carrying `gh_jid` in the URL, an Oracle tenant on a
custom host whose path keeps `/CandidateExperience/.../job/`, a Lever form
reached with `?LeverAppId=`, a BrassRing `/TGnewUI/Search/...` page. Note
Simplify keys on **`gh_jid`** — `gh_src` alone is not a match.

## Full table — every ATS entry in the config

| ATS key | URL patterns | apply btn | submit btn | success | embedded | inputs |
|---|---|:--:|:--:|:--:|:--:|--:|
| **ADP** | `*://recruiting.adp.com/srccar/public/*`<br>`*://myjobs.adp.com/*/cx/*` |  |  | ✓ |  | 26 |
| **ADP2** | `*://workforcenow.adp.com/mascsr/*/*/recruitment/*` |  |  | ✓ |  | 23 |
| **Amazon** | `*://*.amazon.jobs/*/*` | ✓ |  | ✓ |  | 18 |
| **Apple** | `*://jobs.apple.com/*/*`<br>`*://jobs.apple.com/app/*/apply/*` |  | ✓ | ✓ |  | 13 |
| **AshbyHQ** | `*://jobs.ashbyhq.com/*/*/application*` | ✓ | ✓ | ✓ | ✓ | 25 |
| **Avature** | `*://*.avature.net/*/ApplicationForm*`<br>`*://*.avature.net/*/ApplicationMethods*`<br>`*://*.avature.net/*/ApplicationQuestions*`<br>`*://*.avature.net/*/ApplicationReview*`<br>`*://*.avature.net/*/Register*`<br>`*://*.avature.net/campusApply*`<br>`*://*.avature.net/*/GeneralInfo*`<br>`*://*.avature.net/careers/JobDetail/*`<br>`*://*.avature.net/*/careers/JobDetail/*`<br>`*://*.avature.net/*/External/JobDetail*`<br>`*://*.avature.net/careers/LocationAndProfile/*`<br>`*://*.avature.net/*/careers/LocationAndProfile/*`<br>`*://*.avature.net/careers/Success*`<br>`*://*.avature.net/*/careers/Success*`<br>`*://www.bain.com/careers/find-a-role/position/?jobid=*`<br>`*://careers.bain.com/jobs/*`<br>`*://careers.jacobs.com/*/careers/Register*`<br>`*://careers.jacobs.com/*/careers/JobDetail/*`<br>`*://careers.tql.com/*/ApplicationForm*`<br>`*://careers.tql.com/*/ApplicationMethods*`<br>`*://careers.tql.com/*/ApplicationQuestions*`<br>`*://careers.tql.com/*/ApplicationReview*`<br>`*://careers.tql.com/*/Register*`<br>`*://careers.tql.com/*/GeneralInfo*`<br>`*://careers.tql.com/*/JobDetail*`<br>**excl** `*://*.avature.net/*/SuccessfulRegistration` | ✓ | ✓ | ✓ | ✓ | 35 |
| **BambooHR** | `*://*.bamboohr.com/jobs*`<br>`*://*.bamboohr.com/careers*`<br>**excl** `*://*/**gh_jid**` |  | ✓ | ✓ |  | 22 |
| **BrassRing** | `*://*/TGnewUI/Search/home/Home*`<br>`*://*/TGnewUI/Search/Home/Home*`<br>`*://*/TGNewUI/Search/home/Home*`<br>`*://*/TGNewUI/Search/Home/Home*`<br>`*://*/TGNewUI/Profile/Home/ProfileBuilder*` | ✓ | ✓ | ✓ |  | 25 |
| **BreezyHR** | `*://*.breezy.hr/p/*`<br>`*://*.breezy.hr/*/apply*` | ✓ | ✓ | ✓ |  | 31 |
| **ByteDance** | `*://jobs.bytedance.com/*/*/*/detail*`<br>`*://jobs.bytedance.com/*/*/*/apply*`<br>`*://jobs.bytedance.com/*/*/applied*`<br>`*://joinbytedance.com/search/*` |  | ✓ | ✓ |  | 13 |
| **Comeet** | `*://*.comeet.com/jobs/*/*/*/*`<br>`*://*.comeet.co/jobs/*/*/apply*` | ✓ | ✓ | ✓ |  | 17 |
| **Cursor** | `*://cursor.com/careers/*` |  | ✓ | ✓ |  | 5 |
| **DayforceHCM** | `*://jobs.dayforcehcm.com/*/jobs/*/apply*`<br>`*://jobs.dayforcehcm.com/*/jobs/*` |  | ✓ | ✓ |  | 23 |
| **Dover** | `*://app.dover.com/apply/*` |  | ✓ | ✓ |  | 17 |
| **Eightfold** | `*://*.eightfold.ai/careers*` | ✓ | ✓ | ✓ |  | 20 |
| **FreshTeam** | `*://*.freshteam.com/jobs/*` |  | ✓ | ✓ |  | 15 |
| **Google** | `*://*.google.com/about/careers/applications/apply/*` |  | ✓ | ✓ |  | 15 |
| **GovernmentJobs** | `*://*.governmentjobs.com/jobs/*`<br>`*://*.governmentjobs.com/careers/*/jobs/*` |  | ✓ | ✓ |  | 25 |
| **Greenhouse** | `*://boards.eu.greenhouse.io/*`<br>`*://boards.greenhouse.io/*`<br>`*://job-boards.eu.greenhouse.io/*`<br>`*://job-boards.greenhouse.io/*`<br>`*://*/**gh_jid**`<br>`*://*.coinbase.com/careers/*`<br>`*://*.hubspot.com/careers/*`<br>`*://jobs.dropbox.com/listing/*/apply*`<br>**excl** `*://boards.greenhouse.io/*/confirmation`<br>**excl** `*://waymo.com/joinus/*`<br>**excl** `*://careers.withwaymo.com/jobs/*` |  | ✓ | ✓ | ✓ | 55 |
| **Gusto** | `*://jobs.gusto.com/postings/*` | ✓ | ✓ |  |  | 7 |
| **Homerun** | _DOM-only_ | ✓ | ✓ | ✓ | ✓ | 12 |
| **IBM** | `*://careers.ibm.com/job/*`<br>`*://careers.ibm.com/apply/join/?job=*`<br>`*://careers.ibm.com/*/careers/JobDetail*` |  | ✓ | ✓ |  | 5 |
| **ICIMS** | `*://*.icims.com/jobs/candidate*`<br>`*://*.icims.com/jobs/*/*/candidate*`<br>`*://*.icims.com/jobs/*/*/form*`<br>`*://*.icims.com/jobs/*/*/questions*`<br>`*://*.icims.com/jobs/*/*/eeo*`<br>`*://*.icims.com/jobs/*/*/job*`<br>`*://*.icims.com/forms*`<br>`*://*.jibeapply.com/jobs/candidate*`<br>`*://*.jibeapply.com/jobs/*/*/candidate*`<br>`*://*.jibeapply.com/jobs/*/*/form*`<br>`*://*.jibeapply.com/jobs/*/*/questions*`<br>`*://*.jibeapply.com/jobs/*/*/eeo*`<br>`*://*.jibeapply.com/jobs/*/*/job*`<br>`*://*.jibeapply.com/forms*` | ✓ | ✓ | ✓ |  | 34 |
| **Indeed** | `*://smartapply.indeed.com/beta/indeedapply/form/*` |  | ✓ | ✓ |  | 4 |
| **JazzHR** | `*://*.applytojob.com/apply/*/*` |  | ✓ | ✓ |  | 20 |
| **JobScore** | `*://careers.jobscore.com/apply_flow/*`<br>`*://careers.jobscore.com/careers/*/jobs/*`<br>`*://careers.jobscore.com/*/*/*apply*job_id=*` | ✓ |  | ✓ |  | 29 |
| **Jobvite** | `*://jobs.jobvite.com/*/job/*`<br>`*://jobs.jobvite.com/*/apply*`<br>**excl** `*://jobs.jobvite.com/*/applyConfirmation*` | ✓ | ✓ | ✓ |  | 24 |
| **Lever** | `*://jobs.lever.co/*/*`<br>`*://jobs.eu.lever.co/*/*`<br>`*://*/*?LeverAppId=*` | ✓ | ✓ | ✓ |  | 31 |
| **LinkedIn** | `*://*.linkedin.com/jobs/*currentJobId=*`<br>`*://*.linkedin.com/jobs/view/*` |  | ✓ | ✓ |  | 6 |
| **Mechanize** | `*://*.mechanize.work/apply/*` |  | ✓ | ✓ |  | 5 |
| **Meta** | `*://*.facebookcareers.com/*`<br>`*://*.metacareers.com/*` |  | ✓ | ✓ |  | 20 |
| **Naukri** | `*://*.naukri.com/job-listings-*`<br>`*://*.naukri.com/registration/createAccount*` | ✓ | ✓ | ✓ |  | 0 |
| **Netflix** | `*://explore.jobs.netflix.net/careers*` | ✓ | ✓ | ✓ |  | 20 |
| **Okta** | `*://www.okta.com/company/careers/*/*` |  | ✓ | ✓ |  | 16 |
| **OracleCloud** | `*://*.oraclecloud.com/*/CandidateExperience/*/sites/*/*/preview/*`<br>`*://*.oraclecloud.com/*/CandidateExperience/*/sites/*/job/*`<br>`*://*/*/CandidateExperience/*/sites/*/*/preview/*`<br>`*://*/*/CandidateExperience/*/sites/*/job/*`<br>`*://*/*/sites/*/jobs/preview/*/apply/*`<br>`*://*.oraclecloud.com/*/sites/*/job/*`<br>`*://*/*/sites/CX*/job/*` | ✓ | ✓ | ✓ |  | 30 |
| **Paylocity** | `*://*.paylocity.com/recruiting/*`<br>`*://*.paylocity.com/Recruiting/*` | ✓ | ✓ | ✓ |  | 23 |
| **PhenomPeople** | _DOM-only_ | ✓ | ✓ | ✓ | ✓ | 33 |
| **PinpointHQ** | `*://*.pinpointhq.com/*/postings/*`<br>`*://*.pinpointhq.com/postings/*` | ✓ | ✓ | ✓ | ✓ | 20 |
| **Polymer** | `*://jobs.polymer.co/*/*` |  |  | ✓ | ✓ | 10 |
| **Recruitee** | `*://*.recruitee.com/*/*` |  | ✓ | ✓ | ✓ | 10 |
| **Rippling** | `*://*.rippling-ats.com/job/*/*`<br>`*://*.rippling-ats.com/jobs/eop_survey/*`<br>`*://ats.rippling.com/*/jobs/*` |  |  | ✓ |  | 21 |
| **Roblox** | `*://jobs.roblox.com/careers*`<br>`*://careers.roblox.com/jobs/*` |  |  |  |  | 17 |
| **SEEK** | `*://*.seek.com/job/*`<br>`*://*.seek.com.au/job/*`<br>`*://*.seek.co.nz/job/*` | ✓ | ✓ | ✓ |  | 12 |
| **SmartRecruiters** | `*://jobs.smartrecruiters.com/oneclick-ui/company/*`<br>`*://jobs.smartrecruiters.com/*/*` | ✓ | ✓ | ✓ |  | 22 |
| **SuccessFactors** | `*://*.successfactors.com/*`<br>`*://*.successfactors.eu/*`<br>`*://*.sapsf.com/career?*`<br>`*://*.sapsf.com/portalcareer?*`<br>`*://*.sapsf.eu/career?*`<br>`*://*.sapsf.eu/portalcareer?*`<br>`*://*.ns2cloud.com/career?*`<br>`*://*.ns2cloud.com/portalcareer?*` | ✓ | ✓ | ✓ |  | 56 |
| **TalNet** | `*://*.tal.net/**/opp/**`<br>`*://*.tal.net/**/candidate*` |  | ✓ | ✓ |  | 21 |
| **Taleo** | `*://*.taleo.net/*/application.jss*`<br>`*://*.taleo.net/*/flow.jsf*`<br>`*://*.taleo.net/*/jobapply*`<br>`*://*.taleo.net/*/ats/careers/*`<br>`*://*.taleo.net/*/htmlResourceViewer.jss*` |  | ✓ | ✓ |  | 40 |
| **Teamtailor** | _DOM-only_ |  |  | ✓ | ✓ | 15 |
| **Tesla** | `*://*.tesla.com/careers/*` |  | ✓ | ✓ |  | 15 |
| **TikTok** | `*://lifeattiktok.com/search/*`<br>`*://lifeattiktok.com/position/*/detail*`<br>`*://lifeattiktok.com/resume/*/apply*`<br>`*://lifeattiktok.com/login*`<br>`*://lifeattiktok.com/create-account*`<br>`*://lifeattiktok.com/createaccount*` | ✓ | ✓ | ✓ |  | 11 |
| **TriNetHire** | `*://app.trinethire.com/companies/*/jobs/*` |  | ✓ | ✓ |  | 17 |
| **Uber** | `*://*.uber.com/careers/apply*`<br>**excl** `*://*.uber.com/careers/apply/dashboard/*` |  | ✓ | ✓ |  | 23 |
| **Ultipro** | `*://*.ultipro.com/*/JobBoard/*/Account/Register*`<br>`*://*.ultipro.com/*/JobBoard/*/OpportunityApply*`<br>`*://*.ultipro.com/*/JobBoard/*/OpportunityDetail*`<br>`*://*.ultipro.ca/*/JobBoard/*/Account/Register*`<br>`*://*.ultipro.ca/*/JobBoard/*/OpportunityApply*`<br>`*://*.ultipro.ca/*/JobBoard/*/OpportunityDetail*`<br>`*://*.rec.pro.ukg.net/*/JobBoard/*/Account/Register*`<br>`*://*.rec.pro.ukg.net/*/JobBoard/*/OpportunityApply*`<br>`*://*.rec.pro.ukg.net/*/JobBoard/*/OpportunityDetail*` |  | ✓ | ✓ |  | 34 |
| **Waymo** | `*://waymo.com/joinus/*`<br>`*://careers.withwaymo.com/jobs/*` |  | ✓ | ✓ |  | 21 |
| **Workable** | `*://apply.workable.com/*`<br>`*://jobs.workable.com/search?*selectedJobId=*` | ✓ | ✓ | ✓ |  | 12 |
| **Workday** | `*://*.myworkdayjobs.com/*`<br>`*://*.myworkdaysite.com/*` | ✓ | ✓ | ✓ |  | 44 |

`WORKDAY_DEGREE_VALUES` is a value lookup table, not an ATS — 56 real entries.

The `inputs` column is how many field selectors the entry defines. It is a
rough proxy for how completely a form gets filled: Workday 44, Greenhouse 55,
SuccessFactors 56, Taleo 40 → deep coverage; **LinkedIn 6, Indeed 4** → the
engine only drives the wizard (next/submit) and fills a handful of fields.
Do not read "supported" as "fills everything".

## Job boards — a different feature

`Boards` is not autofill. On these four, Simplify injects its own button next
to the site's apply control:

| Board | URL patterns |
|---|---|
| **Handshake** | `*://*.joinhandshake.com/stu/jobs/*`<br>`*://*.joinhandshake.com/stu/postings*` |
| **Indeed** | `*://*.indeed.com/m/basecamp/viewjob*`<br>`*://*.indeed.com/viewjob*`<br>`*://*.indeed.com/jobs?*`<br>`*://*.indeed.com/*.html?vjk=*` |
| **LinkedIn** | `*://*.linkedin.com/jobs/collections/*`<br>`*://*.linkedin.com/jobs/search/*`<br>`*://*.linkedin.com/jobs/search-results/*`<br>`*://*.linkedin.com/jobs/view/*` |
| **WelcomeToTheJungle** | `*://app.welcometothejungle.com/dashboard/jobs*`<br>`*://app.welcometothejungle.com/jobs*` |

The LinkedIn button is configured `applyText: "Apply with Autofill"`,
`hideWhenUnsupported: true` — i.e. the config intends the button to be hidden
when Simplify cannot help with that posting. **Unverified in the browser** —
if it holds, reading that button off a LinkedIn posting is a far cheaper and
more accurate triage signal than resolving the destination host and looking it
up in a table. Worth one empirical check before the triage skill relies on it.

## Cross-check against this repo's `ats/*.md`

| `ats/` note | Simplify | |
|---|---|---|
| `apply.deloittece.com` | ❌ no match |  |
| `bamboohr.com` | ✅ BambooHR |  |
| `careers.epam.com` | ❌ no match |  |
| `careers.hellofresh.com` | ❌ no match |  |
| `careers.honeywell.com` | ❌ no match | repo says "no panel on Oracle" — Oracle *is* supported, but only on `/CandidateExperience/` and `sites/CX*/job/` path shapes; that tenant's URL shape likely missed |
| `form.erecruiter.pl` | ❌ no match |  |
| `job-boards.greenhouse.io` | ✅ Greenhouse |  |
| `jobs.7n.com` | ❌ no match |  |
| `jobs.ashbyhq.com` | ✅ AshbyHQ |  |
| `jobs.jobvite.com` | ✅ Jobvite |  |
| `jobs.smartrecruiters.com` | ✅ SmartRecruiters |  |
| `join.com` | ❌ no match |  |
| `justjoin.it` | ❌ no match |  |
| `kariera.creativestyle.pl` | ❌ no match |  |
| `myworkdayjobs.com` | ✅ Workday |  |
| `nofluffjobs.com` | ❌ no match |  |
| `onetap.work` | ❌ no match | the aggregator itself, not an application host |
| `recruitee.com` | ✅ Recruitee |  |
| `recruitify.ai` | ❌ no match |  |
| `smartapply.indeed.com` | ✅ Indeed |  |
| `solid.jobs` | ❌ no match |  |
| `system.erecruiter.pl` | ❌ no match |  |
| `talentlyft.com` | ❌ no match |  |
| `teamtailor.com` | ❌ no match | DOM-detected (`embeddedPaths`) — supported despite no host pattern |
| `traffit.com` | ❌ no match |  |
| `www.comeet.co` | ✅ Comeet |  |
| `www.experis.pl` | ❌ no match |  |

**Confirmed unsupported, and they are the Polish/EU core of this queue:**
Traffit, join.com, Personio, justjoin.it, nofluffjobs.com, solid.jobs,
eRecruiter (`*.erecruiter.pl`), TalentLyft, Recruitify, Experis, EPAM's own
portal, 7N, Deloitte CE, creativestyle. None appear anywhere in the config.

**Supported but the repo has no note yet** — likely to show up in this queue:
Lever (`jobs.lever.co`, `jobs.eu.lever.co`), Workable (`apply.workable.com`),
iCIMS (`*.icims.com`, `*.jibeapply.com`), SuccessFactors / SAP
(`*.successfactors.com|.eu`, `*.sapsf.com|.eu`), Taleo (`*.taleo.net`),
Avature (`*.avature.net`), BreezyHR (`*.breezy.hr`), JazzHR
(`*.applytojob.com`), Eightfold (`*.eightfold.ai`), Teamtailor (DOM),
PhenomPeople (DOM), Homerun (DOM), Rippling, PinpointHQ, Dayforce, ADP,
Ultipro/UKG, Polymer, Dover, TalNet, Paylocity, FreshTeam, JobScore,
GovernmentJobs, BrassRing, SEEK, Naukri, plus single-employer entries
(Amazon, Apple, Google, Meta, Netflix, Tesla, Uber, IBM, Okta, Roblox, Waymo,
ByteDance, TikTok, Cursor, Mechanize, Gusto).

## How to regenerate

```bash
python3 - <<'EOF'
import json,glob
p=glob.glob('~/Library/Application Support/Google/Chrome/*/Extensions/pbanhockgagggenencehbnadejlgchfc/*/remoteConfig.json'.replace('~',__import__('os').path.expanduser('~')))[-1]
d=json.load(open(p))
for n,c in sorted(d['ATS'].items()):
    print(n, c.get('urls') or '<DOM-only>')
EOF
```
