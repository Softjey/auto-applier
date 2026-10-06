# Workday (*.myworkdayjobs.com)

Multi-tenant, hosted per company (`{tenant}.wd{N}.myworkdayjobs.com`). Whether a candidate
account is required is decided **per tenant**, not by the platform:

- **kcura.wd1.myworkdayjobs.com (Relativity)**: "Apply Manually" leads to a
  **Create Account/Sign In** step before any application fields — a real account is required.
  Simplify offers "Create Account & Autofill", which is off-limits (it makes the account with
  Simplify's own credentials, not the user's). Create the account with the Applier extension's
  **Create account** button instead and click Workday's own Create Account — see SKILL.md
  § Portals that require an account. The account is **per tenant**: the login is saved under the
  tenant's own host (`kcura.wd1.myworkdayjobs.com`), never under `myworkdayjobs.com`.
- **sphera.wd1.myworkdayjobs.com (Sphera)**: "Apply Manually" skips account creation entirely and
  goes straight to My Information — a genuine **guest-apply** flow. Check the stepper right after
  clicking Apply: if it does *not* list "Create Account/Sign In" as the first step, no account is
  needed and the whole Simplify fast path applies normally.
- **accenture.wd103.myworkdayjobs.com (Accenture)**: requires a Create Account step, same as
  Relativity — Simplify's "Create Account & Autofill" is off-limits here too, same account-creation
  policy applies.

## Searchable picklists (School, Field of Study, etc.) only search on Enter

A Workday typeahead/picklist field (seen on Accenture's Education section — "School or
University", "Field of Study") can silently do nothing while you type: `read_network_requests`
showed **zero** requests fired per keystroke, not a matching problem but the search never
triggering at all. Fix: type the full search term, then **press Enter** — only Enter fires the
autocomplete request on this tenant, not the debounced-typing behavior other pickers use
elsewhere. Confirmed working: "Gdansk School of Banking" + Enter → selected as a chip;
"Computer Science" + Enter → 6 results, exact match selected. Try this whenever a Workday
picklist shows "No Items" for a search term that should obviously exist.

**Always check the stepper before assuming an account is required** — don't park a vacancy on the
user until you've actually seen the Create Account/Sign In step.

## Polish-address fields (seen on Sphera)

A Poland-based application form asks for Street Name, House Number, Apartment, Post Office/Other
Address, Neighborhood, District, City, Postal Code, Municipality, Voivodeship/Province — often
duplicated as English and "- Polish" variants. Apply the qa[] address-placeholder policy: `_` for
free-text sub-fields with no true value, `00001` for postal code where unknown, city/municipality
= the real city (e.g. Warsaw), Voivodeship = the city's real one (Warsaw → **Masovian**). Only the
non-"- Polish" fields tend to be required; the "- Polish" duplicates are usually optional — check
for the asterisk before filling both.

## Simplify

Supported. Autofills name/email/phone/address and **all Experience/Education entries from its own
profile — verify every one against the tailored resume**, don't assume genuine. Once the account
had prior resume data it pulled the real work history — accurate, not invented.

**Known wrong answers seen**: it answered "Will you now or in the future require sponsorship for
employment visa status?" → **No** on a role whose real posting location differed from the location
OneTap recorded — always re-derive this answer from `profile.workAuthorization` against the
**actual posting's location** (open the ATS page, don't trust the aggregator's city field), never
accept Simplify's answer at face value on this question.

**Required fields it reports "complete" but leaves empty**: Country/Region and City on some
tenants (see also `jobs.smartrecruiters.com.md` for the same failure pattern on that ATS) — always
scroll through and check every required field yourself before Next/Submit.

**A resume file input inside Workday's own iframe/shadow layer may be directly reachable** — try
`find`/`read_page` for a normal ref first (worked on Sphera) before falling back to the
`jobs.smartrecruiters.com.md` shadow-DOM DataTransfer bridge technique (needed on that ATS, not
this one).

## Success signal

URL query gains `Job_Application_ID=...` and the page shows a "Congratulations! Your application
was submitted successfully!" modal. That modal may also offer to create a Workday account
post-submission ("Password Requirements..." with an email/password form) — this is optional and
unrelated to the application already being submitted; close it without creating an account.
