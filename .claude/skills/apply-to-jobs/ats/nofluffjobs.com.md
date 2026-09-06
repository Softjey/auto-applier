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
