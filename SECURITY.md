# Security

## What is sensitive here

The code in this repo holds no personal data. Your own data repo does (profile, salary
expectations, work-authorization status, answers given to employers, and — if you use
the extension's password manager — portal logins in `credentials.json`). Keep that repo
private and never give it a public remote.

## How the extension limits exposure

- It talks only to a local server on `127.0.0.1:7357`.
- The server returns a password only to this extension's pinned id, only for the exact
  host (or same registrable domain, never across a multi-tenant host), and never over
  plain http.
- It fills forms and never presses an employer's Submit button.

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting
(Security tab → Report a vulnerability) on this repository.
