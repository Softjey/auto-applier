# Teamtailor (<tenant>.teamtailor.com)

Multi-tenant; this file is named for the tenant met first but the quirks are the
platform's.

## Quirks

**Apply is in-page** — "Apply now" expands the form on the same URL, no new tab.

**Field names are Rails-style bracket params**: `candidate[first_name]`,
`candidate[last_name]`, `candidate[email]`, `candidate[phone]`, and the cover
letter at `candidate[job_applications_attributes][0][...]`. The CV input is
`candidate_resume_remote_url`, additional files `candidate_file_remote_url`.

**There is no separate consent checkbox.** The submit button itself carries the
privacy text ("By submitting this application, I agree that I have read the
Privacy Policy..."), so submitting *is* the consent. Nothing to tick.

**Cookie banner offers "Decline all non-necessary cookies"** — take it.

**Range questions render a custom slider over a hidden `input[type=range]`**
(width 1px). Setting `.value` + `input` event updates the DOM value but not the
displayed number the form actually submits — it kept showing "1" while
`value` read "4". Drag the visible thumb by coordinate (min → max spans the
visible track, so value k of n sits at (k-1)/(n-1) of the width), then read
the big number next to the track, not `input.value`.

**Consent inputs come in pairs** (Rails hidden `value=0` + real checkbox with
the same name): `querySelector('[name=...]')` returns the hidden one and reads
`false` forever. Read `input[type=checkbox][name=...]`, and tick by clicking the
styled box by coordinate — `input.click()` on the real checkbox did not toggle
the visible box, and the future-recruitment box next to it flipped on once, so
re-check both before submitting.

**Radio / checkbox custom questions** (`candidate[answers_attributes][N][boolean|choice|choices][]`)
do toggle on `input.click()` and read back correctly via `.checked`.

**Phone is a country-code widget** — type `+48123456789`, it reformats to
`+48 123 456 789`. Text answers and the file upload (`file_upload` on the
`candidate_resume_remote_url` ref) work normally; the filename shows in a chip.

## Success signal

URL becomes `/jobs/<id>-<slug>/applications/<uuid>/thanks/<hash>` and the
title "Applied to <job title>", page text "Thanks for applying". A second
"Connect" step offers profile creation — leave it.

**Some tenants gate on e-mail verification** (CodiLime): the submit lands on
`/jobs/<id>-<slug>/applications/email_verification_needed` with "Verify your
email — click the verification link to complete your application". The
application is not complete until the candidate clicks the link in his own
mailbox, so leave the vacancy SAVED with a note and tell the user; never mark
APPLIED on that page.

**Typing right after the modal opens can be lost** — on CodiLime the first
pass of ref clicks + typing left every field empty (the form re-mounts once
after "Loading application form"). `scroll_to` the first ref, type, and read
`input.value` back before continuing; the second pass stuck.
