# BambooHR careers (<tenant>.bamboohr.com/careers/<id>)

## Quirks

**Honeypot.** A visible-looking text input named `nickname_hpcsaf` labelled
"Please leave this field blank" sits in the form. Never write to it; verify it
reads `''` before submitting. The suffix appears to be per-render, so match on
the `nickname_` prefix rather than the full name.

**Country defaults to United States** and the address block adapts to it. Set
Country first: click the control, type into the search box that appears, click
the matching row. Once Poland is selected, the "State" select becomes a free
text field relabelled "Province", and ZIP is relabelled "Postal Code".

**The address block is fully required** — Address, City, Province, Postal Code
all carry `*`. For a user who withholds street address and postal code, this is
where their placeholder policy has to be applied, and where a rejected
placeholder becomes a question for them rather than something to invent.

**Date Available is `mm/dd/yyyy`** — US order even for a Poland-based role.

**The real file input is separate from the visible "Choose File" button.**
`find` returns the button first; ask for the file input explicitly and upload to
that ref rather than clicking the button (which opens the native picker).

**Custom questions are `customQuestionAnswers.short_<id>` (text) and
`customQuestionAnswers.multi_<id>` (radio group).** The radio labels carry the
option text; the question text lives several parent levels up.

## Success signal

Not yet observed.
