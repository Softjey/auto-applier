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
Leave the vacancy SAVED with a note; never mark it APPLIED.

## Success signal

The modal is replaced by a confirmation that the application has been sent to
the named company. A "create my profile" button appears next to it — do not
click it.
