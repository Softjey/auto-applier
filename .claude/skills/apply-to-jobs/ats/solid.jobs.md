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

**Salary and availability are their own required text fields**
("Jakiego oczekujesz wynagrodzenia?", "Od kiedy mozesz zaczac nowa prace
(okres wypowiedzenia)?"), so the quote has a real home here.

## Success signal

Not yet observed.
