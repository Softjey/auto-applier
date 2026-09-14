# BambooHR careers (<tenant>.bamboohr.com/careers/<id>)

## Quirks

**Honeypot.** A visible-looking text input named `nickname_hpcsaf` labelled
"Please leave this field blank" sits in the form. Never write to it; verify it
reads `''` before submitting. The suffix appears to be per-render, so match on
the `nickname_` prefix rather than the full name.

**Country defaults to United States** and the address block adapts to it. Set
Country first: click the control, type into the search box that appears, click
the matching row. Once Poland is selected, the "State" select becomes a free
text field relabelled "Province", and ZIP is relabelled "Postal Code".

**The address block is fully required** — Address, City, Province, Postal Code
all carry `*`. For a user who withholds street address and postal code, this is
where their placeholder policy has to be applied, and where a rejected
placeholder becomes a question for them rather than something to invent.

**Date Available is `mm/dd/yyyy`** — US order even for a Poland-based role.

**The real file input is separate from the visible "Choose File" button.**
`find` returns the button first; ask for the file input explicitly and upload to
that ref rather than clicking the button (which opens the native picker).

**Custom questions are `customQuestionAnswers.short_<id>` (text) and
`customQuestionAnswers.multi_<id>` (radio group).** The radio labels carry the
option text; the question text lives several parent levels up.

## Success signal

Not yet observed.

## The Apply button silently dies on a stale page (seen 2026-09-06, miquido)

Clicking "Apply for This Job" did nothing at all — no navigation, no modal, no
`window.open` — and the console showed
`Uncaught (in promise) TypeError: Cannot read properties of null (reading 'hasPasskey')`.
`/careers/<id>/apply` is a 404, and `/jobs/view.php?id=<id>` redirects back.

What worked: reach the posting through the **job board's** Apply control, which
opens BambooHR in a fresh tab inside the MCP group, and click Apply there. On a
freshly opened tab the form renders in place.

## Date format follows the tenant's locale

The note above says `mm/dd/yyyy`; the Polish tenant's placeholder read
`dd/mm/yyyy`. Read the placeholder, do not assume US order.

## reCAPTCHA gates the submit

A reCAPTCHA v2 checkbox sits directly above "Submit Application". Clicking it is
a hard limit, so leave the filled form in its tab and the prepared values in the
note; the user ticks and submits from there (done on 2026-09-06 — "Thank You.
Your application was submitted successfully"). The token expires after about two
minutes, so a tick and a Submit have to happen in the same breath: do not ask
the user to tick and then go away to do something else. Until the confirmation
page is on screen the vacancy is **SAVED**, never `APPLIED`.

## Custom questions

`customQuestionAnswers.yes_no_<id>` radio pairs. The question text lives
several parent levels up; walk up until the ancestor's `innerText` is long
enough to be the question. Seen on this tenant: a mandatory
"consent for this recruitment" (answer Yes), an optional "future recruitment
processes" (answer No), and a screening question
"Do you currently live in Poland and speak Polish fluently?".

## Simplify

Supported (2026-09-14, Avanquest). Fills name, e-mail, phone, City, Country and —
from its own profile — the address block: Address `_` (matches our policy),
but **Postal Code `00001` and Province `MZ`** (policy says `_` and
`mazowieckie`) and **Date Available = today's date**, which is invented.
Fix the first two, clear the date. It leaves the honeypot alone.

A **visible reCAPTCHA checkbox** appears only after the first Submit click
("Please confirm you're not a robot to continue") — a hard stop. Leave the
filled tab for the user.
