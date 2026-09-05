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

## Success signal

Not yet observed.
