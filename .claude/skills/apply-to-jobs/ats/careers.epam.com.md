# EPAM careers (careers.epam.com)

One employer's own careers site, reached from an aggregator's "apply on the
company site" control. The form is a long modal over the vacancy page — scroll
*inside* the modal, not the page behind it.

## Quirks

**Plain text inputs are React-controlled.** Native value setter plus an `input`
event works for `name`, `surname`, `email`, `phone` and the numeric
years-of-experience field, and for the "CV language" radio.

**Phone has a separate country selector.** Write the national number, digits
only; the widget renders the prefix itself.

**Every dropdown is a react-select typeahead — programmatic assignment does
nothing.** Click the control, type enough to filter, then click the option row.
The city list loads asynchronously and shows "Loading…" first, so take a fresh
screenshot before clicking a row rather than clicking where you expect it to be.

**The preferred-countries control is a checkbox multi-select**, not a single
select: typing filters it, clicking the row adds a removable chip, and the
dropdown *stays open* afterwards covering the fields below. Press Escape before
going on, or the next click lands in the list.

**The warning icon next to some labels is NOT an error marker.** It sits
beside Current Country, Primary skill and Years of experience and stays there
after the field is filled — it is an informational glyph. Do not use it as a
completeness check. Read the real state instead: enumerate the modal's
inputs and their values through `javascript_tool`. The react-select search
inputs always read empty (the selection lives in the chip / single-value node),
so check those by their rendered text.

**Both consents are optional** — a multi-year data-retention consent and a
marketing one. Leave both unchecked.

## Success signal

Not yet recorded — add it on the next completed run.
