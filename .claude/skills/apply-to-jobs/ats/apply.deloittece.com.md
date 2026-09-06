# Avature (apply.deloittece.com)

Deloitte Central Europe's recruitment platform. Three steps: **Resume** → **Contacts,
additional document** → **Complete application**.

## No account is required

"or login if you are already registered" is optional — the Upload CV path applies as a
guest. Terms of Use and the Privacy Notice are accepted implicitly by applying; there is
no checkbox for either.

## The blocker: Upload CV needs a trusted file-picker event

Step 1 is a single **Upload CV** control (`#resumeFile`, inside
`form#manualRegisterMethodsForm`, POST). It advances only on a real OS picker event.
Everything else was tried on 2026-09-06 and the page stayed on step 1:

- setting the file through the browser tool — it lands (`files.length === 1`, the input
  shows `C:\fakepath\<name>.pdf`) and is then ignored
- `input` and `change`, plain and `composed`
- `jQuery('#resumeFile').trigger('change')` — the site ships jQuery and binds by
  delegation (`jQuery._data(el,'events')` is empty on the element itself), so this was
  the likeliest candidate
- `form.submit()` — round-trips and comes back to step 1 with the file dropped
- clicking the visible button — reopens the native picker

**So this ATS cannot currently be driven end to end.** Fill nothing, send nothing, and
leave the vacancy `SAVED` with every prepared answer in the note so the user finishes it
in one pass. Steps 2 and 3 have never been reached, so their field set is unknown.

## Cookie banner

"Accept all" / "Reject all" / a settings icon. Reject all. **It reloads the page and
clears `#resumeFile`** — decline cookies before touching the upload, not after.

## Liveness probe false positive

The first `navigate` often returns a partially-rendered page whose text trips a
`/expired/` dead-posting regex. Re-probe before closing the vacancy out; on the second
load the match is gone and "Apply now" is present.

## Success signal

Unknown — never reached.
