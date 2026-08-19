# creativestyle careers site (kariera.creativestyle.pl)

One employer's own careers site rather than a hosted ATS, reached from an
aggregator's "apply on the company site" control. A long, personal form — five
free-text questions covering motivation, a short bio, a project the candidate is
proud of, and hobbies.

## Quirks

**The form is behind its own link.** The landing page shows only the ad; the
form renders after clicking the page's own call-to-action.

**A Usercentrics cookie banner sits over the submit button.** Decline it BEFORE
submitting — the first attempt silently did nothing because the banner was
intercepting the click.

**The contract type is asked TWICE.** `choice_1820` is a radio pair mid-form,
and `contract_uop` / `contract_b2b` are a SEPARATE checkbox pair right above the
submit button. Filling only the radio leaves the form incomplete.

**Field naming:** plain `text_*` inputs, `textarea_16xx` for the essay
questions, `choice_18xx` for radio/checkbox groups (all options in a group share
one name), `resume_246_file` / `resume_246_links`, `privacy_consent`.

**The technology checkbox list has 31 entries** and invites over-claiming. Tick
only what the candidate's own skill ratings support; the list being long is not
a reason to widen what they claim.

## Success signal

Not observed. Three submits across a single day returned the site's own failure screen —
a jokey "something went wrong and we did not receive your application" page —
with no validation errors, every required field filled and the CV attached. That
is a server-side failure, and it is a HARD FAILURE: do not mark APPLIED, leave
the vacancy SAVED and retry another day. Form values and the attached file
survive the error dialog, so a retry only needs the submit button again.
