# SOLID.Jobs (solid.jobs)

Polish IT contracting board that hosts its own apply form — a posting sourced
from an independent recruiter here is not necessarily email-only.

## Quirks

**Two-step URL.** The share link `solid.jobs/o/<code>/<slug>` redirects to
`solid.jobs/offer/<id>/<slug>`; "APLIKUJ TERAZ" then goes to
`solid.jobs/apply/<id>/<slug>`, which is where the form lives.

**Angular Material.** Fields are `mat-input-<n>` in DOM order, which means the
ids are positional and not stable across postings — read the labels, then write
by id, then read back.

**Three consent checkboxes, two mandatory**, in this order:
1. `[obowiazkowe]` acceptance of the site's terms and privacy policy
2. `[obowiazkowe]` consent to take part in **this** recruitment
3. optional consent to take part in **future** recruitments — leave unticked

**Cookie banner**: take "ODRZUC OPCJONALNE" (reject optional).

**Salary is a numeric-only input with two selects beside it** — "Jaką
preferujesz formę zatrudnienia?" (`mat-select-0`, defaults to the posting's
contract form, e.g. B2B) and "Waluta/Rodzaj" (`mat-select-1`, e.g. "PLN
netto", monthly). Type the bare number (`31000`); the units live in the
selects, so do not write "PLN netto/miesiąc" into the box — non-digits are
dropped. Availability is a combobox (`mat-input-4`) with a fixed list: od
zaraz / od początku miesiąca / 1–3 miesiące wypowiedzenia — click it and pick
the row by coordinate; `mat-option` nodes are not in the DOM until opened.

**Phone is digits-only** (`inputmode=numeric`): `123456789`, no `+48`.

**Typing through `find` refs can land in nothing after a cookie click** — the
form re-rendered once and every value was gone. Verify with `input.value` by id
before uploading the CV, and re-type by coordinate if empty. The viewport
coordinate frame also changed mid-run (1436×840 → 1509×812); re-screenshot
before any coordinate click.

**Consent checkboxes** (`mat-mdc-checkbox-N-input`) toggle on a coordinate
click of the box; `.checked` reads back correctly. The Portfolio box carries a
GitHub icon — it gets the GitHub URL.

**Submit is the "APLIKUJĘ" `type=submit` button** at the bottom; click by
coordinate after `scroll_to`.

## Second step after submit

Submitting lands on `/apply-succeeded/<id>/<slug>` — **the application is
already sent at this point** (step "1 WYŚLIJ CV" done) — and then asks for a
self-assessment ("Aby dokończyć aplikowanie określ swoją praktyczną
znajomość"): one `[role=radiogroup]` per required skill with Nie znam / Znam /
Znam i wykorzystuję w pracy (the board pre-selects some from the CV, check
every row), one per language (Nie znam / Pisanie i czytanie dokumentacji /
Komunikatywny w mowie i piśmie / Język ojczysty — each rendered twice, for two
breakpoints; both groups reflect the same choice), an experience bracket group
(0–1 … 10+ lat) and a "Preferowane miejsce pracy" `mat-button-toggle` row.
`element.click()` on the `[role=radio]` buttons works; the button-toggles need
a real coordinate click. Answer from `skills.csv` ratings (see qa[] policy),
then "POTWIERDZAM ZNAJOMOŚĆ".

## Success signal

Same `/apply-succeeded/...` URL, page text "ZGŁOSZENIE WYSŁANE — Twoje CV
zostało przekazane do pracodawcy!" after the self-assessment is confirmed. The
CV itself was already delivered on the first submit.

## The salary box is free text with a suggestion panel (2026-09-06)

`mat-input-3` ("Jakiego oczekujesz wynagrodzenia?") accepts text, not just an
integer. The calculator icon beside it opens a panel with the offer's own band
as clickable chips plus per-period examples (Godzina / Dzień / Miesiąc / Rok) —
that panel is how you learn which unit the employer thinks in. Clicking a chip
did **not** fill the field; type the value yourself. There is no period select,
only `mat-select-0` (contract form) and `mat-select-1` (currency + net/gross),
so state the period in the text: `150/h`.

## An offer with two contract forms has two Apply buttons

B2B and UoP variants sit side by side in the sidebar, each with its own band.
Click the one matching the contract form being quoted.

## The post-submit step asks more than the skill matrix

`/apply-succeeded` is already the submitted state ("ZGŁOSZENIE WYSŁANE"). The
form that follows adds, after the per-skill rows: language rows (Nie znam /
Pisanie i czytanie dokumentacji / Komunikatywny w mowie i piśmie / Język
ojczysty), an experience bracket (0–1 / 1–2 / 2–4 / 4–6 / 6–10 / 10+ lat) and a
"Preferowane miejsce pracy" checkbox group. Some rows arrive pre-highlighted —
click the intended option anyway rather than trusting the shading.
