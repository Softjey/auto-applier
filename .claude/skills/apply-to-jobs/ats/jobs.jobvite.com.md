# Jobvite (jobs.jobvite.com / app.jobvite.com)

Multi-tenant. A tenant's careers site lives at `jobs.jobvite.com/careers/<tenant>/job/<id>`;
`app.jobvite.com/CompanyJobs/Job.aspx?j=<id>` redirects to it.

## Quirks

**A Data Consent interstitial stands between the Apply link and the form.**
`/job/<id>/apply` first renders only one control: a `#jv-country-select`
("Location of Residence and Language") plus an "I ACCEPT" submit. Nothing else
is in the DOM — an extractor run here reports a single field and zero submits,
which looks like a broken page but is not. Pick the country, click I ACCEPT,
and the real form replaces it in place at the same URL.

The consent is the employer's applicant privacy notice, scoped to the
application. It is a prerequisite for seeing the form at all, not an optional
marketing opt-in.

**reCAPTCHA is v3 (invisible badge).** `textarea#g-recaptcha-response` and a
`.grecaptcha-badge` are present with no challenge. Nothing to interact with.
If a v2 challenge ever appears instead, stop.

**A LinkedIn opt-in rides along with the form**: an unlabelled checkbox reading
"I agree to allow my application statuses to be visible inside LinkedIn
Recruiter (optional)". Broader than the single application — leave it unticked.

**Field names are opaque and per-tenant** (`input-yzxpXfwc` and the like), so
match on the label, then write by `name`. The State select is a US state list
and is not applicable to a Polish applicant; Region is a separate required
select with continent-level options (America / Asia / Europe / Others).

## Success signal

Not yet observed — the 2026-09-04 run stopped before SEND APPLICATION.
