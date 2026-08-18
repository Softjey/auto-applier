# justjoin.it in-page apply modal

Some vacancies apply through a modal on justjoin.it itself rather than an
external ATS. Minimal form: name, email, CV (PDF only, max 5 MB), an optional
"message for the employer" toggle.

## Quirks

**`find`'s ref for the modal's Apply button does not submit.** Clicking
`ref_<n>` for the submit button did nothing twice; clicking the same button by
coordinate submitted immediately. Screenshot, then click by coordinate.

**"I'm creating an account, I accept the Terms of Service" is NOT required.**
Leave it unchecked — applying works without it, and creating an account is out
of scope. Same for the marketing consent.

**Inputs are React-controlled** — use the native value setter plus an `input`
event, as with Recruitee.

**The offer page's own `Apply` button** (sidebar or sticky footer) is what opens
the modal. On vacancies with an external ATS the same button opens a new tab
instead; check `tabs_context_mcp` after clicking.

## Success signal

The modal is replaced by `Done! Your application has been sent to <Company>.`
A `Create my profile` button appears next to it — do not click it.
