# Workable (apply.workable.com)

Posting `/<tenant>/j/<id>`, form on the Application tab `/<tenant>/j/<id>/apply/` (Simplify's
"Start Application" opens it). Success: URL gets `?success`, page text "Thank you! Your
application has been submitted successfully." The own extension has no adapter here.

## Quirks (2026-10-01, Intellectsoft)

**Fields are keyed by `name`**: `firstname`, `lastname`, `email`, `phone`, `address`, `gdpr`, and
`QA_<id>` for every custom question. Text answers need real input (`find` ref → click → `type`);
read back by name.

**The form autosaves a draft.** After a reload (even a forced one) the fields and the uploaded
resume come back, so a discarded attempt is not lost, and a half-filled form is safe to reload.

**The first submit can hang on "Submitting…" with a disabled button and the toast "There are some
issues with your application".** It followed a resume upload made while the form was still
settling and Simplify still scanning. Reload with `force` (the draft returns), re-check the fields,
Submit again: it went through. Upload the resume by `file_upload` on the "Replace file"/file ref and
wait until the filename chip shows before submitting.

**Simplify's scan takes ~60 s here and writes late.** It wrote "Gdansk, Poland", later "Warsaw, MZ,
Poland" into the optional Address box, after I had cleared it (not true values; no street address
policy). Clear Address last, right before Submit.

**Phone has a preset country-code select (+48):** type the digits only.

**Free-text screening questions are plain text inputs** ("level of English", "available to start"):
`B2` / `In 2 weeks`, from the profile.
