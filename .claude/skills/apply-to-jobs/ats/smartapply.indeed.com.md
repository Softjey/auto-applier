# Indeed Apply (smartapply.indeed.com)

Reached from a `pl.indeed.com/viewjob` posting via
`Подання заявки за допомогою Indeed` / `Apply with Indeed`. Stays in the same
tab, so it does not fall out of the MCP tab group.

## Quirks

**The posting itself can gate.** `pl.indeed.com` may redirect to
`secure.indeed.com/auth?...&from=bot-detection-anonymous`. It often clears by
itself once the session is warm — retry the job URL once. Never sign in, never
create an account, never solve a challenge; if it persists, ask the user to log
in themselves and stop.

**Multi-step, progress is saved server-side.** Steps: contact → location →
resume → employer questions → review (100%). Leaving and re-entering resumes
where you left off, and an already-uploaded resume stays selected — check
before re-uploading.

**Location step: postal code and street are optional.** They are not in
`profile.json`; leave them empty rather than asking.

**`find` returns ten identical `Продовжити` refs.** Only one is real. Scroll to
the bottom and click the visible button by coordinate instead.

**Screenshots can 403 once** on this host right after arriving. Retry the same
call; it succeeds on the second attempt.

**Uncheck the job-alert subscription** on the review page — it is a standing
subscription, not part of the application.

## Success signal

`form/post-apply` with `Вашу заявку надіслано до компанії "<Company>"` plus a
confirmation e-mail.

**Employer date fields want `DD.MM.YYYY`.** A `Date Available` field renders as
`input[type=text]` and silently accepts `2026-09-01`, then rejects it on
Continue with `Недійсний формат дати, введіть дату у форматі DD.MM.YYYY`. Write
`01.09.2026`. Clear the field before rewriting it — reassigning over the bad
value alone did not always re-trigger validation.

**Questions can span more than one page.** `questions/1` Continue may lead to
`questions/2` with a fresh required question (emporix asked about Polish
fluency there, invisible on page 1). Phase 3 cannot see these, so expect the
mid-Phase-4 escalation rule to fire here.

**The employer's own address questions are not the location step.** The
location step's postal code and street are optional and should be left blank,
but an employer question block may ask `Address *` / `Postal/ZIP *` as required
free text. Those are separate fields and need a real Phase 3 answer.

**A previously uploaded resume with the same filename stays preselected.** It is
the *old* tailored CV from an earlier run, not this vacancy's. Always re-upload
through `Передати інший файл` and confirm the card reads `Щойно завантажено`.
