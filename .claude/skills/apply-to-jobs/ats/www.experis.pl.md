# Experis Poland careers (www.experis.pl)

Employer's own form at `/pl/candidate/jobapply?id=<guid>`, reached from the
posting's "APLIKUJ" button on `/pl/jobb/<id>/<slug>` (same tab). Just Join IT's
Apply opens the posting page in a new tab that lands inside the MCP group.

## Quirks

**Values set through JS are ignored by the form model.** Setting `.value` with
the native setter plus `input`/`change` events renders in the inputs, and the
extractor reads them back, but the POST to
`/api/services/Applicant/JobApplyWithEmail` then carries only the consents —
`PersonalInfo` is missing — and the server answers `{"status":0}` while the page
shows the generic toast "Wystąpił błąd. Prosimy spróbować później." Type every
field for real (click, select-all, type). Inputs are keyed by GUID `id`s that
change per posting; find them by label.

**The CV widget keeps its own state.** `file_upload` on the hidden
`input[name="CV_file_upload"]` works — the filename chip appears and the file
goes out as a `CV` multipart part — but `input.files` reads empty afterwards, so
verify by the chip text, not by `files.length`. Re-upload after removing the
chip (the ✕) if the form was re-filled.

**Consent checkboxes are hidden native inputs** (`input[type=checkbox]` with
zero rect); `input.click()` toggles them and `.checked` reads back correctly.
Order: site terms (mandatory), candidate database / future recruitments
(mandatory — a user policy decision, see qa[]), special-category data
declaration (mandatory), marketing (optional, leave off).

**The submit is a `type=button` "APLIKUJ"** at the bottom (a second, hidden
"Apply" exists); click the visible one. Cookie banner: "Rezygnuję z plików
cookie".

## Success signal

Navigates to `/pl/candidate/jobapplysuccess?id=SUCCESS` with "Gratulacje
<name>! Dziękujemy za przesłanie aplikacji." — match on the URL path.
