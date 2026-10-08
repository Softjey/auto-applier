# McKinsey careers (Avature, jobs.mckinsey.com)

Job page on `www.mckinsey.com` → "Apply Now" is a plain same-tab link to
`jobs.mckinsey.com/.../ApplicationMethods`. Needs an account.

- A cookie dialog (Decline Optional Cookies) appears on both hosts and blocks the page until closed.
- Picking a CV on the first screen ("From Device") does not move on; use **Without Resume**, register,
  upload the CV in the application steps.
- Register: the Applier **Create account** fills names, e-mail, both passwords and ticks the privacy
  box; the form then needs a **reCAPTCHA** — `autofill_captcha` returned `failed` twice when Chrome's
  window was hidden ("Chrome's window stays hidden… the page takes no mouse input"). Bring the window
  to the front and call it again before pressing Create account.
  Fixed in `solve.ts` (2026-10-08): the worker now raises Chrome through the debugger
  (`Page.bringToFront`, focus emulation) and re-attaches once if Chrome drops the session
  ("Debugger is not attached"). After the fix the tick went through; Google then showed a **picture
  challenge** on the empty Register page — a challenge is the user's, never solved by the agent.
- **Never press the extension's Create account twice for one portal.** It generates and saves a new
  password each time; when the first run has already registered the account (or the user finished the
  captcha and submitted), the second password is wrong and sign-in fails ("An account with this email
  already exists", then "username or password may be incorrect"). Check `credentials.mjs status` first and
  sign in instead; if the account exists but the password is lost, only the user can reset it.
