# No Fluff Jobs (nofluffjobs.com)

A Polish board with its own in-page apply modal; the employer never gets its
own form.

## Quirks

**Decline cookies first or nothing is clickable.** The consent bar covers the
lower third. The non-essential toggles are already off, so "Save Settings" is
the decline; "Accept all" is next to it — read the button, not the position.

**Apply is the sidebar button**, not the sticky footer one. The footer button
scrolled the page and did nothing; the blue sidebar "Apply" opens the modal.
The modal fades in over ~3 s — probe again rather than clicking twice.

**Never press Escape inside the modal.** It closes the whole dialog and every
field, upload and checkbox is lost. To close a dropdown, click its own control
again.

**Inputs have no `name` and no `id`.** Identify them by DOM order among the
visible inputs: 1 Name & Surname, 2 E-mail address, 3 Phone number. The page's
own search box is also an input — filter to the ones inside the dialog.

**`input.checked` lies here.** Every checkbox read back `true` with a zero-size
rect (hidden native inputs behind styled boxes) while the screen showed them all
empty. Decide from a `zoom` on the row, never from the DOM.

**"Which language do you know?"** is a plain English / Polish checkbox pair.
**"Save my data. Create an account."** is account creation — leave it.
**"Processing additional data in future processes"** is an optional consent.

**"Choose job location" is a required multi-select** whose only option on a
remote posting is "Remote". "I live in" is optional and is a searchable list
whose results render below the fold — skip it rather than fighting the modal.

## Success signal

URL becomes `/job/<CODE>/success` with the banner "The application has been
sent. Thank you for applying with No Fluff Jobs."

## Headless Chromium is blocked (2026-09-30)

A scripted Chromium gets CloudFront `403 ERROR: The request could not be satisfied`
before any page renders. The user's own Chrome loads it fine. Not worth working around:
inspect this site in the user's browser. Also: an offer whose Apply button carries the
external-link icon (Devire's) is **not** the in-page modal — a click there did not open
one, so treat such an offer as an external apply until seen otherwise.

## Seen 2026-11-06 (TPConnects offer)

The Apply button needs a second try: the first click can show nothing for several
seconds; clicking it by element ref opened the modal. Name, e-mail, LinkedIn and
GitHub were prefilled by the extension; the phone box was empty. `file_upload`
must target the **second** file input (the one with no id) and then `input`/`change`
dispatched; the first input (`#file`) accepts the file but the drop zone never shows
"File selected". The consent text is informational only (no required checkbox);
"Which language do you know?" is a required checkbox group; tick from `profile.languages`. The data administrator named in the
consent can be a recruiting agency, not the company on the offer.
