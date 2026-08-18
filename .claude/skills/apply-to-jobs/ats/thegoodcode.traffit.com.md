# Traffit (*.traffit.com)

Clean, single-page form. The easiest of the three met so far.

## Quirks

**Reached only through a page-opened tab.** justjoin.it's `Apply` opens a new
tab that lands OUTSIDE the MCP tab group, so it cannot be driven. Click it
once to learn the destination URL, then `navigate` the managed tab there.

**Selectize comboboxes.** `Availability` and the language selects render as a
text input reading `Click to load the list.` with an empty `<select>` behind
them. Click the control, type a few characters to filter, then click the
option row. `form_input` on the underlying select does nothing.

**Consent checkboxes ignore clicks on the label.** Click the input box itself
(its own rect), not the surrounding text. Verify with `.checked` afterwards.
The first consent is mandatory; the second (future recruitment) is optional and
should be left unchecked.

## Success signal

Navigates to `public/form/thankyou/<id>?application_timestamp=...` with a green
check and `Thank you!`.

## Update 2026-08-18 (cerebre.traffit.com)

**Drive selectize through its own API, not by clicking.** The note above about
clicking the control and filtering still works, but `sel.selectize` is exposed
on the native `<select>` and is far more reliable:

```js
const sel = document.querySelector('select[name="..."]');
const hit = Object.values(sel.selectize.options).find(o => o.title === "B2");
sel.selectize.setValue(hit.id, false);
```

Options carry `{title, id}` — match on `title`, set by `id`. Verify with
`sel.value` and `sel.selectize.$control.text()`.

**The page-opened tab did land inside the MCP tab group** this time, contrary to
the note above. Check `tabs_context_mcp` rather than assuming either way.

**The job link is not the form.** justjoin.it's Apply lands on
`/public/an/<hash>`, a job description page; the form is behind its
`Join Cerebre` link at `/public/form/a/<hash>`. Read the anchor's href and
navigate there.

**Consent checkboxes are `dynamic_form[provisions][N]`** — `[1]` mandatory,
`[2]` future recruitment, left unchecked. A plain `.click()` on the input works.
