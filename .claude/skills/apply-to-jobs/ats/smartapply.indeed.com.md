# Indeed Apply (smartapply.indeed.com)

Reached from an Indeed posting via its "Apply with Indeed" control (the label is
localized to the site's country domain). Stays in the same tab, so it does not
fall out of the MCP tab group.

## Quirks

**The posting itself can gate.** Indeed may redirect to
`secure.indeed.com/auth?...&from=bot-detection-anonymous`. It often clears by
itself once the session is warm — retry the job URL once. Never sign in, never
create an account, never solve a challenge; if it persists, ask the user to log
in themselves and stop.

**Cloudflare bot-detection can gate the whole domain, not just one posting.**
Every Indeed vacancy returned a security-check interstitial for several minutes,
then cleared on its own with no interaction. Retry the URL a couple of times,
move on to non-Indeed vacancies in the queue, and come back — never attempt to
solve or bypass the challenge.

**Check for expiry before doing any per-ATS work.** An expired posting loses its
apply control entirely and renders only a share icon, and a job aggregator will
happily still list it as active. Cheapest triage: navigate the posting and test
whether the body text matches an expiry phrase in the site's own language,
plus whether any apply control exists at all. One JS call per vacancy beats
discovering it after generating a resume. Such a posting is dead for everyone:
close it out as `NOT_INTERESTED` with the reason (SKILL.md Phase 1 step 3),
never APPLIED.

**Multi-step, progress is saved server-side.** Steps: contact → location →
resume → employer questions → review (100%). Leaving and re-entering resumes
where you left off, and an already-uploaded resume stays selected — check
before re-uploading.

**Location step: postal code and street are optional.** Leave them empty rather
than asking, unless they are in `profile.json`.

**The employer's own address questions are not the location step.** The
location step's postal code and street are optional and should be left blank,
but an employer question block may ask for an address or postal code as
*required* free text. Those are separate fields and need a real Phase 3 answer.

**A previously uploaded resume with the same filename stays preselected.** It is
the *old* tailored CV from an earlier run, not this vacancy's. Always re-upload
through the "upload a different file" control and confirm the card shows the
just-uploaded state.

**`find` returns ten identical refs for the Continue button.** Only one is real.
Scroll to the bottom and click the visible button by coordinate instead.

**Employer date fields want `DD.MM.YYYY`.** A date field renders as
`input[type=text]` and silently accepts an ISO `YYYY-MM-DD`, then rejects it on
Continue with a format-validation message. Clear the field before rewriting it —
reassigning over the bad value alone did not always re-trigger validation.

**Questions can span more than one page.** Continue on `questions/1` may lead to
`questions/2` with a fresh required question that was invisible on page 1. Phase
3 cannot see these, so expect the mid-Phase-4 escalation rule to fire here.

**Uncheck the job-alert subscription** on the review page — it is a standing
subscription, not part of the application.

**Screenshots can 403 once** on this host right after arriving. Retry the same
call; it succeeds on the second attempt.

## Success signal

URL becomes `form/post-apply` and the page confirms the application was sent to
the named company, plus a confirmation e-mail. Match on the URL.

## Update 2026-10-08

- `get_apply_target({vacancyId})` (OneTap MCP) returns the exact Indeed `viewjob?jk=…` URL — no
  need to search Indeed for a posting.
- A posting that Indeed marks as expired (the Ukrainian UI says the posting's validity period on Indeed has ended) is dead: close it
  as `NOT_INTERESTED`. The Cloudflare gate on `pl.indeed.com` cleared by itself after ~10 s on the
  second visit; do not interact with it.
- External postings: the "Apply on company site" anchor opens `…/applystart` in a new tab; set
  `target='_self'` and click to stay in the managed tab.
