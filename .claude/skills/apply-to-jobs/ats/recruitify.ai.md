# Recruitify (*.recruitify.ai)

A job board's Apply opens the Recruitify **job page** in a new tab (inside the
MCP group). The form is not on it yet.

## Quirks

**Two-step, one button.** The page's own apply button first reveals the form;
the same button at the bottom then submits it. Do not assume the first click
submitted anything.

**Inputs have no `name`, no `id` and no `label[for]`.** `querySelector('[name=…]')`
finds nothing and `resolve-fields` cannot key off labels. Identify them by type
and DOM order, cross-checked against the visible label rendered above each one.
The order seen so far:

| # | type | asks for |
| --- | --- | --- |
| 1 | text | full name |
| 2 | email | e-mail |
| 3 | text | phone |
| 4 | file | CV |
| 5 | number | expected rate (the unit and contract form are stated in the label — read it) |
| 6 | file | additional file (optional) |

Screenshot before filling — the order is the only handle you have, and field 5
is the one that changes meaning between tenants.

**React-controlled inputs** — use the native value setter plus an `input` event,
as with Recruitee.

**No mandatory consent.** The data-protection block is informational; the single
checkbox is the optional future-recruitment one and stays unchecked.

## Success signal

URL becomes `/job/<uuid>/thanks`.

## A visible reCAPTCHA now gates the form (seen 2026-09-06, linkgroup tenant)

Below the consents sits a reCAPTCHA v2 "I'm not a robot" checkbox. Pressing
Apply without it re-renders the page with "Field is required" under the widget
and submits nothing. Fill the whole form, write the answer sheet, then `autofill_captcha` and Apply at
once (SKILL.md § CAPTCHAs) — a tick then Apply landed on the `/thanks` page on
2026-09-06. A picture challenge → leave the tab open and the vacancy **SAVED**
with every prepared value in the note. Never set `APPLIED` before the
confirmation page is actually on screen.

## Field order seen on the linkgroup tenant

Different from the order recorded above — read it per tenant:

| # | type | asks for |
| --- | --- | --- |
| 1 | text | Name and surname * |
| 2 | email | E-mail address * |
| 3 | file | Send your CV * |
| 4 | text | Profil Linkedin (optional) |
| 5 | checkbox | "* I am applying for recruitment process!" — required |
| 6 | checkbox | "You can keep my data for future recruitment processes!" — optional |
| 7 | checkbox | "I want to know what's going on marketing-wise!" — optional |

There is no phone field and no salary field here.

**`el.focus()` + typing does NOT work** on these inputs — the value stays
empty. Click the input by coordinate first, then type.

## The form renders inline, not on a new URL

"Aplikuj" mounts the form on the same `/job/<id>` URL — the path does not change and the
input count goes from 0 to ~20. Do not wait for a navigation.

## Consents are styled boxes over hidden natives

The consent checkboxes have no readable text near the input and no `<label for>`, and the
native input's `getBoundingClientRect()` is offset from what you see — a click on the
reported rect misses. Identify them by DOM order; on the Euvic tenant that is
**future-recruitment consent (optional, leave)**, **required RODO acknowledgement
(tick)**, **"select all of the above" (never)**. Click the *visible* box read off a
fresh screenshot, then confirm with `.checked` and a `zoom`.

## The reCAPTCHA is per-tenant, not per-ATS

The Link Group tenant gated Apply behind a visible reCAPTCHA v2; the Euvic tenant
(2026-09-06) had none and submitted straight through to `/job/<id>/thanks`
(a "thank you for filling in the form" message). Probe for it rather than assuming.
