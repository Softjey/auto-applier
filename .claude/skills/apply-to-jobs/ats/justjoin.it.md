# justjoin.it in-page apply modal

Some vacancies apply through a modal on justjoin.it itself rather than an
external ATS. Minimal form: name, email, CV (PDF only, max 5 MB), an optional
"message for the employer" toggle.

## Quirks

**`find`'s ref for the modal's Apply button does not submit.** Clicking the ref
did nothing twice; clicking the same button by coordinate submitted
immediately. Screenshot, then click by coordinate.

**"I'm creating an account, I accept the Terms of Service" is NOT required.**
Leave it unchecked — applying works without it, and creating an account is out
of scope. Same for the marketing consent.

**Inputs are React-controlled** — use the native value setter plus an `input`
event, as with Recruitee.

**The offer page's own Apply button** (sidebar or sticky footer) is what opens
the modal. On vacancies with an external ATS the same button opens a new tab
instead; check `tabs_context_mcp` after clicking.

## Reaching an external ATS

The Apply button's new tab has so far always landed **inside** the MCP tab
group, across Recruitee, Traffit and Recruitify. Still call `tabs_context_mcp`
after the click rather than assuming.

## Expired offers

An expired posting renders an "offer expired" alert and **removes the Apply
button entirely** — there is nothing to click and no ATS to reach. An
aggregator can still list such a vacancy as active well past that point (one
was listed active for another two weeks on the day its justjoin.it page was
already dead), so the board is the authority, not the aggregator's `expiresAt`.
The posting is dead for everyone, so close it out rather than leaving it in the
queue: `NOT_INTERESTED` with the reason and this URL in the note (SKILL.md
Phase 1 step 3). Never mark it APPLIED.

## Success signal

The modal is replaced by a confirmation that the application has been sent to
the named company. A "create my profile" button appears next to it — do not
click it.

**The URL does not change.** The offer page keeps its own address while the
modal turns into "Done! Your application has been sent to …", so a submitted
application is invisible to a `tabs_context` sweep. Checking whether a modal
ATS has already been submitted means reading the page, not the address bar.

## The board widget outranks the description text on money

One offer's description said "Rate: 160–200 PLN/h/B2B" while its own
salary widget said **200 – 270 PLN Net per hour - B2B** — and OneTap's
normalised 33,600–45,360 PLN/month matched the widget (×168 h), not the prose.
Read the widget, and note that it also states the period and contract form,
which OneTap flattens to `period: MONTH` regardless.

## The first click on Apply is often swallowed

The sidebar and sticky-footer Apply buttons frequently do nothing on the first
click after a page load, then open the modal on the second. Two clicks in a row
can also open and immediately close it. Click once, probe for
`input[name=name]`, and only click again if it is absent.

## Some offers' Apply opens the external ATS in a new tab

Miquido's Apply opened `miquido.bamboohr.com` as a **new tab inside the MCP
group** rather than the in-page modal — as the section above says, always call
`tabs_context_mcp` after the click instead of assuming which of the two
happened.

## Per-employer consents appear inside the modal

Besides the two Just Join IT boxes, an employer may add its own
`future_consent_accepted` ("przyszłe rekrutacje", or "affiliated entities").
Every one seen so far is optional — check `required` and leave it unticked.

## The modal is a `<form>`, not a dialog (seen by the autofill extension, 2026-09-30)

The apply modal has no `role="dialog"`: it is a plain `form` holding `input[name=name]`
(ONE field, "First and last name"), `input[name=email]`, `input[name=attachment]` (file),
an unnamed optional checkbox, `create_account_accepted` and
`marketing_consent_accepted`. The only `role="dialog"` on the page is the **cookie
notice** — scoping by role lands on that, not on the form. Scope by
`form:has(input[name=name])`.

The cookie notice (and a "Create an account" popup) intercept pointer events: a normal
click on Apply times out until the notice is closed or the click is forced.

While the modal is open the app marks the rest of `<body>` `aria-hidden`/inert; anything
injected into `<body>` (an overlay panel) becomes unreachable. Mount under `<html>`.
