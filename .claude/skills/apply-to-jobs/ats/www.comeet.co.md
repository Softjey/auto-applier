# Comeet / Spark Hire Recruit (comeet.com wrapper, www.comeet.co form)

## Quirks

**The apply form is in a cross-origin iframe and invisible to the wrapper.**
`comeet.com/jobs/<tenant>/<job>/<pos>` exposes no form fields at all to
`javascript_tool`. Read `iframe#iFrameResizer1`'s src — it points at
`www.comeet.co/jobs/<job>/<pos>/apply` — and navigate the tab straight there.
The tab then hosts the form same-origin. Same shape as the Greenhouse embed.

**Fields are keyed by `name`**: firstName, lastName, email, phone, cv,
linkedin, websiteUrl, coverLetter, portfolio, comment.

**The phone field strips spaces on input** — "+48 123 456 789" reads back as
"+48123456789". That is the field normalising, not a lost write.

**No salary field, and `comment` ("Personal note") stays empty** unless the
posting asks for something specific there. The salary figure goes only into the
OneTap note.

## Success signal

Not yet observed.

## The first click + type after load lands nowhere

A batch of click/type pairs issued right after the form rendered left every
field empty, with no error. A single click on the first field, verified with
`document.activeElement.name`, then the same batch, worked. Verify focus once
before typing on this host.

## Success signal (observed 2026-09-06)

The form is replaced in place, same URL, by "Thank you <First name>! Your
application has been submitted. Good luck!"

## Employers add their own screening questions below the personal block

Named by the full question text rather than a short key, e.g.
`name="This role is strictly a B2B Contractor position (freelance contract)…"`
(radio) and `name="What is your expected monthly net rate (in USD) for this B2B
contract?"` (text). Match on the prefix; do not expect an id.

## Simplify

Supported. It autofills the wrapper page, but the fields are unreachable there;
navigate the tab to the iframe URL (it re-autofills the same fields by itself):
first/last name, e-mail, phone, LinkedIn. Employer screening questions and the
CV stay yours. After Submit it offers "Add Custom Application" to its tracker —
cancel.
