# eRecruiter — the NEW form (form.erecruiter.pl)

`system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=<guid>` now
**redirects to `form.erecruiter.pl/form/<guid>`**, a completely different, sane
React form. `system.erecruiter.pl.md` describes the old ASP.NET WebForms one —
check which of the two you actually landed on before following either.

## What is different from the old form

- **No honeypots seen**, no postbacks, no field resets after the upload.
- **Plain field names**: `firstName`, `lastName`, `email`, `phone`, `city`,
  `cvFiles`, plus one `custom_<numeric id>` textarea per employer question. The
  question text is in the wrapping element.
- **City is free text**, not an autocomplete. Country is a separate optional
  control.
- **Consents are numeric names** (`3194`, `111`) and were both *optional* —
  read `required` rather than assuming.
- **Submit is a visible button "Wyślij"**; the cookie bar's decline is
  "Odrzuć wszystkie".

## The fastest way to fill it

`el.focus()` followed by real typing works and needs no coordinates:

```js
document.querySelector('[name=firstName]').focus()
```

then `type`. Verify with `document.querySelector('[name=…]').value`. This was
markedly faster than scroll + screenshot + coordinate click, and it is what to
reach for on any form whose fields sit far below the fold.

## Success signal

URL becomes `/form/<guid>/thank-you` with "Dziękujemy za wypełnienie
formularza!".
