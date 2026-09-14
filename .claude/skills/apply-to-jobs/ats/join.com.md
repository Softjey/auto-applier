# JOIN (join.com/companies/<tenant>/<jobId>-<slug>)

Multi-tenant. The posting's "Apply now" goes to
`/companies/<tenant>/<jobId>/apply/authentication`, then a wizard:
CV → cover letter → questions.

## Quirks

**E-mail magic link instead of a password.** The authentication step takes only
an e-mail (or "Continue with Google") and sends "Sign in and continue your
application to <Company>" from `noreply@join.com`, valid 60 minutes. No account
is created and no password is typed — finish it per `SKILL.md` § Finishing an
application that verifies by e-mail.

**Do not rebuild the link from the Gmail connector's text.** The connector
decodes quoted-printable a second time, so every `=XY` with valid hex is eaten:
`loginToken=26…` arrives as `loginToken&…`, `jobId=16691870` as
`jobId\x16691870`. When the eaten pair is a non-UTF-8 byte it becomes `�`
and the token is unrecoverable. A rebuilt link that did check out (256 hex
chars) was already dead — single-use. What works: open the message in Gmail
**in the browser tab** and click "Sign in and continue" there. Reading the token
out of the DOM is blocked as credential materialization, and is not needed. The
tab JOIN opens lands inside the MCP tab group, already at `/apply/cv`.

**The CV step comes pre-filled with whatever CV the account uploaded last.**
Remove it and upload the tailored PDF; the preview confirms which one is set.

**The cover-letter step can be mandatory.** The visible Continue stays
`disabled` until a file is attached; the enabled `Continue` in the DOM is a
hidden responsive duplicate (zero-width rect), not a way through. Without a
cover letter on file, this is an escalation.

## Simplify

No panel on join.com (2026-09-14).

## Success signal

Not yet observed.
