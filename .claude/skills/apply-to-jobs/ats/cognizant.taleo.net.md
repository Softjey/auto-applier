# Taleo (*.taleo.net, seen on cognizant.taleo.net)

Old JSF multi-step flow (Resume Upload → Personal Information → Education and Experience →
Attachments → EEO → eSignature → Review and Submit). Needs a candidate account: **New User** →
the Applier extension's **Create account** → Taleo's own **Create an account** button; the
password rules (6-32 chars, no more than 2 identical in a row) accepted the generated one.

## Quirks

**The resume parser writes garbage — read every prefilled field.** It filled First Name `resulted`,
Last Name `in`, duplicated an employer and left job titles empty. Overwrite the contact block,
delete duplicate Work Experience entries (`Remove Work Experience`, a postback that keeps the rest),
and rewrite the rest from the CV / `qa[]` work-history dates.

**Choosing "I want to upload a resume" does not stick on a plain `file_upload`.** The first
Save and Continue returned to the same page with the file gone (the upload radio was still on "I do
not want"). Click the upload radio with `.click()`, confirm `.checked`, upload, then press Save and
Continue; if the page comes back, upload again — the second pass went through.

**Dates are `Calendar` widgets, not inputs.** Set them with the page's own helper:
`setInputDateDate(calendarsParams_[i].componentID, new Date(y, m-1, 1))` (indexes follow page order:
education start, graduation, then Begin/End of each work entry). Ticking *Current Job* hides End Date.

**Place of Residence needs all three levels** (Country, State/Province, Region/city) — the error is
"You must select ALL possible values in the section Place of Residence".

**EEO selects offer "Prefer not to say"** — pick it. **eSignature** wants e-mail and full name.

**Save and Continue sometimes needs the real button** (`find` returns two refs, top and bottom);
a JS `.click()` on the footer once left the page in place.

## Success signal

Page title `Thank You`, text "Process completed. Thank you for your job application."
