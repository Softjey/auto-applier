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
- **Submit is a visible button** (Polish "Send"); the cookie bar's decline is
  the "Reject all" button.

## The fastest way to fill it

`el.focus()` followed by real typing works and needs no coordinates:

```js
document.querySelector('[name=firstName]').focus()
```

then `type`. Verify with `document.querySelector('[name=…]').value`. This was
markedly faster than scroll + screenshot + coordinate click, and it is what to
reach for on any form whose fields sit far below the fold.

## Success signal

URL becomes `/form/<guid>/thank-you` with a "thank you for filling in
the form" message.

## Radix / shadcn widgets (seen by the autofill extension, 2026-09-30)

The radios and the consent checkbox are **`button[role=radio]` / `button[role=checkbox]`**
with `aria-checked`, grouped in `div[role=radiogroup][aria-required]` and labelled by
`label[for=<radiogroup id>]`. The native `input[type=radio|checkbox]` next to them are
`aria-hidden` shadows nobody can operate (`name=custom_<id>`, `name=<consent id>`) —
clicking a widget flips its `aria-checked`; setting the shadow does nothing. A consent
that looks missing from a scan is usually one of these buttons.

The page also carries a OneTrust cookie centre (`#onetrust-consent-sdk`) full of
checkboxes: it is not the form. Scope to the page's `<form>`.

`system.erecruiter.pl/FormTemplates/…` redirects to `form.erecruiter.pl/form/<guid>`
after load; anything that clicks right after `goto` can hit the page that is about to
be replaced.

## What the forms actually ask, and how each was answered (autofill extension, 2026-09-30)

Seen on ALTEN, Wakacje.pl and EMPIK (all `form.erecruiter.pl/form/<guid>`):

- **Salary comes three ways**: a textarea ("brutto na UoP:", "na kontrakcie B2B:"), a
  free-text box asking amount + contract form, and — EMPIK — a **radiogroup of monthly
  bands** ("26 000 - 28 000 PLN", "below 6 000 PLN", "above 34 000 PLN"). For bands pick
  the one that holds the quote; a figure on a boundary goes to the HIGHER band.
- **Language level is an ordinal radio scale** ("None | Basic | Conversational |
  Advanced | Fluent"), not CEFR. Mapped by the rule in `system.erecruiter.pl.md`: C1/C2
  take the second-highest step, B2 the one below (B2 -> "Conversational" on five steps).
- **Availability is a radiogroup** in Polish durations ("Immediately | 2 weeks | 1
  month"); a notice period of "2 weeks" is the same answer as the 2-week option.
- **Contract preference** ("employment contract", "B2B") is two optional Radix checkboxes.
- A consent's text can mention the CV ("...data contained in my CV"). A classifier that
  looks for the word "CV" in a label will call it a file upload and the consent is then
  never ticked. Only a `type=file` control is a CV field.
- Consent boxes carry no `*` and no `aria-required` even when the form needs them; the
  wording ("Zgoda jest dobrowolna" = voluntary) is the only signal.

**Clicks before `load` are swallowed.** The page is Next.js and hydrates the whole
`document`; until then a click on anything injected under `<html>` reaches the element but
never the injector's own handlers. Wait for `load` before clicking.
