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
`loginFlowRequired=true` means a **candidate account is needed first**: by the repo's rule the
agent fills the sign-up form up to the password and the user sets their own.

