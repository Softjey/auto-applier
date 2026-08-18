# eRecruiter (system.erecruiter.pl)

Used by many Polish employers (BlueSoft). ASP.NET WebForms with postbacks.
The most trap-laden ATS met so far — budget extra time.

## Quirks

**Honeypot field swallows the answer.** An input named `fakeusernameremembered`
sits near the real controls. `form_input` on the ref that `find` returns can
land in it, and the write silently succeeds while the real field stays empty.
Always verify by reading the real control by name:
`document.querySelector("[name='ctl00$DefaultContent$ctl61$tbText']").value`.
When it comes back empty, click the visible textarea by coordinate and `type`.

**The CV upload triggers a postback that rewrites the form.** After the file
lands, `Region/województwo` and `Miasto` are reset to empty and extra required
fields appear (language levels). Order of operations that works:
1. name / e-mail / phone
2. upload the CV, wait for `Gotowe! Dodaliśmy plik CV`
3. *then* country → region → city
4. then availability, rate, language levels

**First CV upload often fails server-side.** The banner
`Wystąpił błąd podczas wysłania plików CV. Usuń pliki CV i dodaj je ponownie.`
appears only after a submit attempt. Fix: click `Usuń` in the file table, then
upload again. Re-check for the banner before submitting.

**The rate field is integer-only.** `Dopuszczalne są tylko liczby całkowite`.
Send `180`, never `150 PLN/h netto (B2B)`.

**Two submit buttons.** `ctl00_DefaultContent_bttnSendNoActive` is a hidden
zero-size twin; `ctl00_DefaultContent_bttnSend` is real but the thing a human
clicks is the orange `Wyślij zgłoszenie!`. Scroll it into view with
`scrollIntoView({block:'center'})`, read the fresh rect, click by coordinate.

**Phone wants digits only** — `Tylko cyfry np. 123456789` → `123456789`.

**Language levels use a Polish scale**, not CEFR:
`brak | podstawowa | komunikatywna | dobra | biegła | język ojczysty`.
C1/C2 → `biegła`, B2 → `dobra`. Show the mapping at the confirmation pause.

## Success signal

Navigates to `FormTemplates/ThankYou.aspx` with
`DZIĘKUJEMY ZA WYPEŁNIENIE FORMULARZA`.
