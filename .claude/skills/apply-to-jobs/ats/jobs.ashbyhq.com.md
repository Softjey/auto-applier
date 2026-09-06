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

## The Location autocomplete is US-first

Typing "Warsaw" returns only Warsaw, Indiana / Missouri / Illinois / New York.
Type `Warsaw, Pol` and the Polish row appears first; then **Down + Return**
rather than clicking the popup, whose rows render on top of the form and are
hard to hit by coordinate.

## A required question is not the same as a required consent

LeoVegas ends with two starred blocks: a privacy-policy acknowledgement (a
single "Yes" checkbox — tick it, it is this application's own consent) and
"retain your details in our talent pool for up to three years", a Yes/No pair
that is *required to answer* but where **No** is a valid answer. Answer No —
consenting is optional even when answering is not.

## Success signal (observed 2026-09-06)

The Application tab is replaced in place, same URL, with a "Success" heading:
"Your application was successfully submitted. We'll contact you if there are
next steps."
