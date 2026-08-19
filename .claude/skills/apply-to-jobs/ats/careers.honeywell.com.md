# Oracle Recruiting Cloud (careers.honeywell.com and other `/*/sites/<Tenant>` hosts)

Oracle's hosted careers site. Recognisable by the URL shape
`<host>/en/sites/<Tenant>/jobs/preview/<jobId>/apply/section/1/` and the Oracle
copyright in the footer. Multi-tenant — expect these quirks on any employer
using it.

## Reaching the form

**The aggregator's apply button opens a tab outside the MCP group** and is a
`<button>`, not an anchor, so its destination cannot be read from the DOM. Go to
the careers site directly instead: `<host>/` redirects to
`/en/sites/<Tenant>`, and `/en/sites/<Tenant>/jobs?keyword=…` is a working
search. Find the posting by title + city + posting date and open it from there.

**`javascript_tool` gets BLOCKED on this host** for anything returning a URL —
the search and job URLs carry long query strings. Return `location.host` or
strip the query before returning.

## Quirks

**No account needed, but the first step is an e-mail gate.** Apply Now goes to
`/apply/email` with an e-mail field and a privacy acknowledgement checkbox. It
says so explicitly: "You don't need to have an account!" There is no password
anywhere in the flow. The NEXT button needs a second click — the first one only
commits the checkbox.

**Plain text inputs take the native value setter** plus `input` + `change`
events. Field ids are `<name>-<n>` (`lastName-16`, `firstName-17`, `email-20`),
where the numeric suffix is per-render — read them off the DOM, never hardcode.

**Fill the address top-down, country first.** The page says so itself and it is
not decoration: the fields are dependent lookups. Country → Street → House →
Postal Code → City. State auto-fills from the postal code and is then read-only.

**Postal Code is a searchable lookup, not free text.** A placeholder value is
rejected: type a real code and click the row that appears
(`00-001, Mazowieckie`). Street and House Number *are* free text and accept a
placeholder. House Number renders with a required outline even though the DOM
does not mark it required.

**The resume input empties itself after a successful upload.** `input.files`
reads back empty — the widget has taken the file into its own state. Confirm by
the green check and filename card in the Supporting Documents section, not by
reading the input.

**Work history, education, skills, languages and the diversity block are all
optional** when a CV is attached. Only Last Name, Country, Street, Postal Code
and the e-signature Full Name are actually required.

## The application questions are legal declarations — always escalate

The form ends with employer compliance questions (prior employment with the
company, restrictive covenants/non-competes, relationships with employees,
government-official and politically-exposed-person status) and then an
**e-signature field**. None of these are derivable from `profile.json`, and the
signature makes them a signed declaration. Ask the user every one of them, every
time; do not reason from absence of evidence. Record the answers in `qa[]` so
the next Oracle-hosted application only needs the employer-specific one.

**The submit button gives a two-stage progress dialog** ("Creating candidate
info", then "Saving job application info") before redirecting. Do not re-click
while it is spinning.

## Success signal

Redirects to `/en/sites/<Tenant>/my-profile` with a "Thank you for your job
application" toast, and the posting appears under ACTIVE JOB APPLICATIONS with
the requisition id, an applied-on date and `Status: NEW`. Match on the
`my-profile` URL plus the application row — the toast fades.
