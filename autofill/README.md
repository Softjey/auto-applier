# autofill

A browser extension plus a local plan server that fills job-application forms on
sites Simplify does not cover: **Traffit, eRecruiter, justjoin.it**.
It fills what is a _fact in `profile.json`_ and stops. It never submits, never
guesses, and never holds your data itself.

```
page ── content script ──▶ background worker ──▶ localhost server ──▶ resolve-fields.mjs ──▶ profile.json
 (scan, fill, panel)        (only network door)    (plan per field)     (same code as the agent)
```

- `packages/protocol` — zod schemas shared by both sides: field descriptors,
  plan entries (a closed set of actions), API and message contracts.
- `packages/server` — Hono on `127.0.0.1:7357`. Delegates every decision to
  `.claude/skills/apply-to-jobs/scripts/resolve-fields.mjs`, so the agent and the
  extension never answer the same question differently. Also serves the tailored
  CVs from `<resumeRepo>/out/SAVED/`.
- `packages/extension` — WXT + React (panel in a Shadow DOM). `src/core` is
  site-agnostic (scan → plan → execute); `src/adapters` holds one file per ATS.

## Use

```sh
cd autofill && pnpm install
pnpm dev:server                 # leave running
pnpm --filter @applier/extension build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** →
`autofill/packages/extension/.output/chrome-mv3`. Open an application form: the
panel appears bottom-right. Pick the CV (pre-selected when the company matches),
press **Fill form**, read the **Needs you** list, fill those, press Send yourself.

## Test

```sh
pnpm check                                            # typecheck + lint + format + unit tests
pnpm --filter @applier/e2e exec playwright test fixture   # real Chromium + built extension + real server
LIVE=1 pnpm --filter @applier/e2e test:live           # opt-in: real employer forms, FAKE data, never submitted
```

The e2e runs the **built** extension in a real Chromium against the real plan
server, on a fake profile (`packages/e2e/fixtures/profile.test.json`) and a fixture CV,
so it can never type the real person into a real form. It needs a Chromium: either
`pnpm exec playwright install chromium`, or point `CHROMIUM_PATH` at one you already have
(branded Chrome ignores `--load-extension`).

## What it will and will not do

| Field                            | Behaviour                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, e-mail, phone, links, city | filled from `profile.json`                                                                                                                                                                     |
| Exact `qa[]` answers             | filled; select/radio only if an option unambiguously matches                                                                                                                                   |
| Mandatory data consent           | ticked; optional / future-recruitment / account boxes never                                                                                                                                    |
| CV                               | attached from the selected tailored PDF                                                                                                                                                        |
| Salary                           | quoted by `salary-quote.mjs` for THIS vacancy (type the published band in the panel; empty = your baseline). A band radio gets the band that holds it; under your floor it refuses and says so |
| Language level                   | the profile's CEFR level mapped onto the form's own scale (C1/C2 second-highest step, B2 the one below) and shown for you to check                                                             |
| Start date / notice period       | `2 weeks` matches `2 tygodnie`, `immediately` matches `Natychmiast`                                                                                                                            |
| Free text, unknown questions     | **left to you**, listed in the panel — the core rule holds                                                                                                                                     |
| Anything already filled          | untouched                                                                                                                                                                                      |

## Adding an ATS

1. Write the quirks in `.claude/skills/apply-to-jobs/ats/<host>.md` (as always).
2. Add `packages/extension/src/adapters/<name>.ts` implementing `SiteAdapter`.
3. Register it in `adapters/index.ts` — its match patterns reach the manifest.
4. Add an HTML fixture in `test/fixtures/` and a case in `test/adapters.test.ts`.

## Security

The server hands out personal data, so it answers exactly one client: the
extension's service worker (loopback `Host` and a `chrome-extension://` `Origin`
are both required; a web page's own fetch is refused). It binds `127.0.0.1` only.
No profile data is stored in the extension.

## Development

`pnpm check` runs typecheck, ESLint, Prettier and all tests. The DOM tests run on
happy-dom fixtures; **they do not replace trying a real form** — each adapter's
selectors come from the ATS notes and should be re-checked on a live form
whenever an ATS changes.
