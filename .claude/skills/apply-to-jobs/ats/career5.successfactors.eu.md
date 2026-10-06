# SAP SuccessFactors Recruiting (career5.successfactors.eu)

Reached from an employer RMK career site (`careers.<employer>.com/job/...`) via
"Apply now" → dropdown "Apply Now". Met on NTT DATA Business Solutions
(`company=itelliP`, 2026-09-22). The LinkedIn apply link for that posting had a
typo host (`careers.enttdata-solutions.com`); swap it for the real one.

## Quirks

**The application form creates a candidate account.** Email, retype email,
"Choose Password", "Retype Password" and a required "Terms of Use: Read and accept
the data privacy statement" sit inside the same form as the questions, and
"Apply" creates the account. Per SKILL.md § Portals that require an account, fill
everything else and leave password, terms and the Apply click to the user.

**CV upload goes through a dialog.** Click the "Upload a Resume" tile by
coordinate (a ref click did nothing), pick "Upload from Device"; that reveals
`input[type=file][name=fileData1]`, which takes `file_upload`. Success banner:
"<file> File uploaded successfully."

**Pickers are custom dropdowns** that open on a coordinate click on the box
(not on a ref click); choose the row by coordinate and zoom to confirm.

**Pre-ticked "Receive new job posting notifications"** — broader than this
application; untick. Profile visibility radio: pick "Only recruiters managing
jobs I apply to".

**Cookie banner**: "Modify Cookie Preferences" → "Confirm My Choices" leaves
advertising off.

## Simplify

Panel present ("Autofill This Page"), not used on this form.

## Success signal

Not yet observed.

## Custom-domain careers sites (RMK) — verified 2026-09-30

A company's own careers domain (e.g. `careers.<company>.eu`) fronts the same SuccessFactors
back end. The job page there is not a supported Simplify page (its panel shows job details
only); its Apply link is `/talentcommunity/apply/<id>/`, which **redirects to `/` when
requested directly** (it needs the click's session), and the real application step lives on
`career<NN>.sapsf.eu/career?career_company=<company>&…&loginFlowRequired=true`. That host
matches Simplify's `*.sapsf.eu/career?*` pattern and Simplify shows "Sign In & Autofill", but
`loginFlowRequired=true` means a **candidate account is needed first**: sign in with the saved
login, or create the account with the Applier extension's **Create account** button (SKILL.md
§ Portals that require an account), not with Simplify's "Sign In & Autofill".


## Account creation through the Applier extension — verified 2026-10-01 (career55.sapsf.eu)

The registration block sits inside the application form (fields `fbclc_userName`, `fbclc_emailConf`,
`fbclc_pwd`, `fbclc_pwdConf`, `fbclc_fName`, `fbclc_lName`, `tor__fcellPhone`, `tor__fcity`).
The extension's **Create account** fills all of them in ~25 s on the real page (the panel says "Working…"
that whole time — wait, do not click again) and the form's questions it can resolve (salary box →
`30 000 PLN`). The extension's "Needs you" list wrongly includes the language switcher ("English US") — ignore it.
**The form ends in a reCAPTCHA**, so Apply (which creates the account) is the user's click: park the vacancy
with the tab open. The saved login stays unconfirmed in `credentials.json` until a sign-in works.

## RMK application form on `career<NN>.sapsf.eu`, filled end to end — verified 2026-10-06

- **CV upload works without the native file dialog.** Click the **"+" icon at the bottom of the
  "Upload a Resume" tile** by coordinate (a click on the tile's text, or a JS click, opens nothing).
  A dialog "Select a source for your file upload" appears with an `input[type=file]`; `find` it and
  `file_upload` the PDF. The tile then shows the file name and date. Do this **before** the captcha:
  a reCAPTCHA ticked earlier showed "Verification expired" by the time everything else was done.
- **Every dropdown is a native `<select>`**: the first click only focuses it, the second opens the
  list; the page re-flows after each answer (error text disappears), so re-screenshot before each
  click. A long list (country) is scrolled with the mouse wheel inside the open list, then the row
  is clicked; typing the name only highlights it.
- **Data-sharing consent selects** ("Do you consent to the processing/sharing of personal data for
  presenting future job offers?") are required but offer "I do not agree" — pick it, the application
  does not need them.
- Typical options: start date = Less than 1 month / 1 / 2 / 3 / More than 3 months; English = A1…C2;
  source = "Job Board (e.g. pracuj.pl, justjoin.it…)". The employer's own text questions (hybrid
  model, salary) are plain textareas with a 200-character limit.
- A right-hand Simplify panel covers the form's right edge; collapse it (the `>` at its top).
- The reCAPTCHA stays the user's. Once they tick it, press Apply within about two minutes.

## Success signal

The portal redirects to a blank job-application page; the proof is the confirmation e-mail
("Thank you for submitting your application…") from the employer's recruitment no-reply address —
read it through the mailbox connector before setting `APPLIED`.
