# eRecruiter (system.erecruiter.pl)

Used by many employers as a hosted form. ASP.NET WebForms with postbacks. The
most trap-laden ATS met so far — budget extra time.

**Renders in several languages.** The control names are the constant
(`ctl00$DefaultContent$…`); the visible labels are not. Match on the control
name, never on the words on screen.

## Quirks

**Honeypot fields swallow the answer.** Inputs named `fakeusernameremembered`
sit next to the real controls — one per free-text question, so expect several.
`form_input` on the ref that `find` returns can land in one, and the write
silently succeeds while the real field stays empty. Always verify by reading the
real control by name:
`document.querySelector("[name='ctl00$DefaultContent$ctl61$tbText']").value`.
When it comes back empty, click the visible textarea by coordinate and `type`.
Before submitting, confirm every honeypot still reads `''`.

**The CV upload triggers a postback that rewrites the form.** After the file
lands, the region and city selects reset to empty and extra required fields
appear (language levels). Order of operations that works:

1. name / e-mail / phone
2. upload the CV, wait for the "file added" confirmation
3. *then* country → region → city
4. then availability, rate, language levels

**The first CV upload often fails server-side.** An error banner asking you to
remove the CV files and add them again appears only after a submit attempt.
Fix: click the delete control in the file table, then upload again. Re-check for
the banner before submitting.

**The rate field is integer-only** and rejects anything else with a
"whole numbers only" validation message. Send the bare number, never a number
with a currency, unit or contract form appended.

**Phone wants digits only**, no spaces and no country prefix.

**Two submit buttons.** `ctl00_DefaultContent_bttnSendNoActive` is a hidden
zero-size twin; `ctl00_DefaultContent_bttnSend` is the real one. Scroll it into
view with `scrollIntoView({block:'center'})`, read the fresh rect, click by
coordinate.

**Clicking submit by stale coordinates hits the consent checkbox.** The page
reflows between screenshot and click; a click meant for the submit button landed
on the optional future-recruitment consent and silently ticked it. Re-screenshot
immediately before the submit click, and verify the consent state afterwards
with `zoom` on that row — a mis-click here opts the user into something they did
not ask for.

**`javascript_tool` starts getting BLOCKED mid-session on this host** with
"Cookie/query string data", even for calls that never touch `location`. Once it
starts, switch to `computer` clicks with coordinates read off a fresh
screenshot.

**Language levels use a local six-step scale, not CEFR.** The options run from
"none" through to "native" — read them off the select and map by ordinal
position (a C1/C2 profile takes the second-highest step, B2 the one below).
Show the mapping at the confirmation pause rather than deciding silently.

**Two separate "how did you hear about us" questions.** A `ctl60` select and a
`ctl62` checkbox list asking about the employer specifically. Both are required
in practice.

**`ctl61$tbText` is the referral e-mail** — it asks for the business address of
whoever recommended the candidate. Leave it empty unless there really was a
referral.

## Success signal

Navigates to `FormTemplates/ThankYou.aspx` with a thank-you headline. Match on
the URL, not the text.

**Every postback wipes the text fields — fill the text last (2026-10-01, Axabee).** The CV
upload, the country change and the region change each reload the form and empty name, e-mail,
phone, city and the free-text boxes. The extension's Fill form uploads the CV first, so after it
the contact block is empty and a second press does nothing ("No CV selected"). Order that worked:
`file_upload` the CV → wait → set country, wait → set region, wait → *then* type every text box
(name, surname, e-mail, phone, city, salary, start) → Send. Delete-and-re-upload the CV before
the first submit; the "error sending CV files" banner came back after a submit made with the
first upload.

**JS `focus()` + `type` and `ref` clicks did not land here; a real coordinate click did.** Take a
screenshot, click the box by coordinate, then `type`, and read it back by control name. The tab's
viewport also shrinks/zooms after screenshots on this host; re-screenshot before each click.
