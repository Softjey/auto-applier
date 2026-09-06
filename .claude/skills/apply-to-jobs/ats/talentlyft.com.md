# TalentLyft (<tenant>.talentlyft.com)

## Quirks

**Two-step entry.** `/o/<code>` redirects to `/jobs/<slug>-<code>`; the
"Apply for this job" link then loads the form at `/jobs/<slug>/new`. The cookie
bar ("Only required cookies" / "Accept all") sits over the Apply link — decline
first.

**The CV widget is Dropzone, and the form field is a different input.**
There are two `input[type=file]`: the real form field `name="Resume"` (hidden)
and `input.dz-hidden-input` (visible). Uploading into `Resume` leaves the drop
area showing "Drop your files here" — the file is in the DOM but the UI, and
probably the POST, never see it. Upload into the **dz-hidden-input**; the chip
"<filename> · Remove file" is the confirmation. To get a ref for it, give it an
`aria-label` first and then `find` that label.

**Field names are Rails-ish**: `FirstName`, `LastName`, `Email`,
`Answers[0].Body` … for each custom question, `RetentionConsent` for the
optional "store my data for N months and contact me about future jobs" box.
A custom question's text is in the wrapping element, not in a label.

**Languages is a repeater** ("Professional data → Languages → + Add"): each row
is two native `<select>`s, `Languages[N].LanguageISO` and
`Languages[N].LanguageProficiency`. The proficiency scale is LinkedIn's —
Elementary / Limited working / Professional working / Full professional /
Native. Setting `.value` + a `change` event works and the rendered text updates.
The language select defaults to "Abkhazian", so an untouched row is wrong, not
empty.

## Success signal

URL becomes `/jobs/<slug>/applied` with "Thank you! All done! Your application
for the <title> position has been submitted successfully."
