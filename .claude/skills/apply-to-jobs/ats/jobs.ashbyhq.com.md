# Ashby (jobs.ashbyhq.com)

Multi-tenant. `jobs.ashbyhq.com/<tenant>/<job-uuid>` is the posting; the form is
behind an **Application** tab on the same page, which navigates to
`.../<job-uuid>/application`.

## Quirks

**Inputs are React-controlled** — native value setter plus an `input` event.
System fields are `_systemfield_name` / `_systemfield_email`; every custom
question is named by a bare UUID, so match on the label text.

**Yes/No questions render as a two-button segmented control**, not as radios or
a select. Click the visible "Yes" / "No" button by coordinate.

**The Location field is an async autocomplete.** Type, wait for "Loading..." to
resolve, then click the resolved row ("Warsaw, Masovian Voivodeship, Poland").
Assigning a value programmatically leaves it unresolved.

**A posting may carry no CV upload at all.** Where the employer leans on written
answers plus LinkedIn/GitHub, `input[type=file]` is simply absent — that is the
form's design, not a missed field.

## A trap worth naming

Some employers put an explicit acknowledgement in the form: *"We'd rather read
your own words than something perfectly polished but generic"* + *"I've read
this and understand that generic AI-generated answers may hurt my
application."* When the narrative answers in the boxes were drafted by the
agent, ticking that acknowledgement misrepresents the application. Leave it for
the user, and tell them the narratives need rewriting in their own voice.

## Success signal

Not yet observed.
