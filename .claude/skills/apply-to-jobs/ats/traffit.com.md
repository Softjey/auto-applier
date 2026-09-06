# Traffit (*.traffit.com)

Clean, single-page form — one of the easier ATSes to drive. Multi-tenant: the
quirks below hold across tenants, with the per-tenant variations noted.

## Reaching the form

**The job link is often not the form.** A job board's Apply may land on
`/public/an/<hash>`, a job *description* page, with the form behind a further
"apply / join us" link at `/public/form/a/<hash>`. Other tenants land straight
on `/public/form/a/<hash>`. Read what you got before hunting for a link.

**It arrives through a page-opened tab**, which has landed both inside and
outside the MCP tab group on different runs. Call `tabs_context_mcp` after the
click rather than assuming either way; if the tab fell outside the group, read
the destination URL and `navigate` the managed tab there instead.

## Quirks

**Drive selectize comboboxes through their own API, not by clicking.** They
render as a text input with an empty `<select>` behind them, and `form_input` on
that select does nothing. `sel.selectize` is exposed on the native element and
is far more reliable than clicking:

```js
const sel = document.querySelector('select[name="..."]');
const hit = Object.values(sel.selectize.options).find(o => o.title === "B2");
sel.selectize.setValue(hit.id, false);
```

**Option ids do not track their labels.** One tenant's option titled `B2` had id
`b1`. Always match on `o.title` and set by `o.id`; verify with
`sel.selectize.$control.text()`, never by reading the raw value.

**The location combobox matches on `locality`, not `title`.** Country and city are
selectize controls like the rest, but their options are objects
(`{country, iso, region1, region2, region3, postcode, locality, latitude, longitude, id}`)
with **no `title` field** — so the usual `o.title === "..."` lookup finds nothing and
`Object.values(sel.selectize.options).map(o => o.title)` comes back as a list of nulls.
Match on `o.locality` instead. The list is preloaded with the major cities of the
selected country, so no typing is needed:

```js
const s = document.querySelector('#dynamic_form_properties_<n>_<n>');
const hit = Object.values(s.selectize.options).find(o => /^Warszawa$/i.test(o.locality || ""));
s.selectize.setValue(hit.id, false);   // renders "Warszawa, Warszawa, Mazowieckie"
```

The country control's name is id-shaped (`..._country`, no bracket syntax) while every
other field uses `dynamic_form[properties][N][M]` — query it by id. It may already be
set to the tenant's country.

**Multi-select variants take an array.** Availability and language fields are
often `<select multiple>` — same API, but `setValue([id1, id2], false)`.

**Consent checkboxes are `dynamic_form[provisions][N]`.** The indices are
per-tenant: the mandatory one has been `[1]`, `[3]` and `[5]` on different
tenants, and the optional future-recruitment one is a separate index. A plain
`.click()` on the input works, but clicks on the surrounding label are ignored —
click the input's own rect and verify with `.checked`.

**A mandatory consent can be a hidden input.** On some tenants only the optional
future-recruitment box renders while the required one is invisible. Set it by
name and confirm `.checked` rather than trusting the screenshot.

**Never use a "select all" consent control** — it also ticks the optional
future-recruitment consent.

## Success signal

Navigates to `public/form/thankyou/<id>?application_timestamp=...` with a green
check. Match on the URL path; the redirect is prompt.
