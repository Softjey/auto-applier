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
