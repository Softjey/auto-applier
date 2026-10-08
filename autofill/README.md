# autofill

A browser extension plus a local plan server that fills job-application forms on
sites Simplify does not cover — one adapter per site in `packages/extension/src/adapters/`.
It fills what is a _fact in your `profile.json`_ and stops. The panel never submits, nothing
here ever guesses, and the extension never holds your data itself. An agent can also drive it
without a browser tool (see "Agent commands" below); the only way it presses a site's own submit
button is an explicit `autofill_submit` call the agent makes after your OK.

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
- Your `profile.json` and `apply-config.json` are not in this repo: they live in your
  private data repo, found through `$APPLIER_DATA_DIR`, the `.data-dir` file at the
  repo root, or `../auto-applier-data` (see the root `README.md`).
- `packages/extension` — WXT + React (panel in a Shadow DOM). `src/core` is
  site-agnostic (scan → plan → execute); `src/adapters` holds one file per ATS.

## Use

```sh
cd autofill && pnpm install
pnpm dev:server                 # leave running (check: node ../.claude/skills/apply-to-jobs/scripts/check-server.mjs)
pnpm --filter @applier/extension build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** →
`autofill/packages/extension/.output/chrome-mv3`. Open an application form: the
panel appears bottom-right. Pick the CV (pre-selected when the company matches),
press **Fill form**, read the **Needs you** list, fill those, press Send yourself.

## Agent commands (MCP) — no browser tool

Driving Chrome with a browser tool (navigate → screenshot → click → read back) is slow. The plan
server therefore also speaks MCP, and the extension takes the agent's commands directly:

```
agent ──MCP/HTTP──▶ server /mcp ──queue──▶ server /ext/next ◀──long-poll── background worker
                                                                                │ tabs.sendMessage
                                                                                ▼
                                          result ◀── /ext/result ◀── content script (scan, fill, click)
```

```sh
claude mcp add --transport http applier-autofill http://127.0.0.1:7357/mcp   # Claude Code, once
# Codex: already in .codex/config.toml
```

| Tool                     | What it does                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `autofill_status`        | is an extension polling this server? call it first                                                                                                                             |
| `autofill_open_and_fill` | opens the URL in a background tab, presses the offer's Apply when the form hides behind it (adapter `opener`), fills, attaches the CV. Returns a structured report and a token |
| `autofill_fill`          | fills the form already showing in a tab (after the agent answered something)                                                                                                   |
| `autofill_read_form`     | every control as the page shows it now: label, kind, required, value                                                                                                           |
| `autofill_submit`        | presses the form's own submit button — needs the token of the last fill; refuses an invalid form or a quote under the floor; reports what the page did (`signal`)              |
| `autofill_captcha`       | ticks a visible "I'm not a robot" box (reCAPTCHA v2, hCaptcha) in any tab with a real mouse; stops at a picture/audio challenge — see "Captcha checkbox" below                 |
| `autofill_close_tab`     | closes a tab it opened                                                                                                                                                         |

**Who may call it.** `/mcp` answers only a client with a loopback `Host`, **no `Origin` header**
(every browser fetch from a web page carries one) and `Content-Type: application/json` (which a
page cannot send cross-origin without a preflight we do not answer). A page on the web cannot reach
it; any program on your machine can, exactly as it can already run Claude Code. The extension's two
routes (`/ext/next`, `/ext/result`) accept only this extension's pinned id.

**Submitting.** `autofill_submit` is the one place this project presses a site's own submit button.
It exists only for adapters that define `submitButton` / `submitted` (justjoin.it so far), only with
the token a fill just returned (one press per fill), and the agent calls it only after the approval
pause. Keep it out of any "always allow" list: the permission prompt on that single tool is your
last gate. The adapter reports success by the site's own confirmation text, or `form-gone`; `none`
means nothing visibly happened and must not be retried blindly.

**Adding an adapter that can do this.** Beyond `scope`/`label`, give it `opener(doc)` (the offer
page's Apply button, when the form opens behind it), `submitButton(root)` and `submitted(doc)`.
`core/open-form.ts` handles the swallowed first click and the "Apply opened another tab" case.

## Captcha checkbox

Level 1 only: a visible "I'm not a robot" box is ticked; anything the widget asks after that
(pictures, audio, puzzles) is the person's. `autofill_captcha` works in any tab of the
browser — also one Simplify filled or a browser tool drives — and `autofill_submit` runs it
before it presses.

```
worker ── webNavigation.getAllFrames ──▶ the widget's frames (anchor / bframe, hCaptcha checkbox / challenge)
   │      captcha.content.ts in every frame: "where is my child iframe?", "where is the box, is it ticked?"
   └─ chrome.debugger ── Input.dispatchMouseEvent ──▶ wheel to bring it on screen, move, press, release
```

- **Why the debugger.** A script's `click()` is `isTrusted: false`, which is what these widgets
  test for, and a content script cannot click inside their cross-origin frames. A CDP mouse
  event is the same trusted input a real mouse produces. The debugger is attached only for
  the click (Chrome shows "started debugging this browser" for that moment) and the tab is
  brought to the front first.
- **Where.** Each frame's content script reports its child iframe's content box; the worker
  sums them up the frame chain, so a widget inside an embedded, cross-origin ATS form is
  found too. The box itself is read inside the widget's frame (`#recaptcha-anchor`,
  `#checkbox`), and so is the tick (`aria-checked`).
- **How it moves** (`src/captcha/human-mouse.ts`, pure and unit-tested): wheel notches of
  ~100 px when the box is off screen; a cubic Bézier with sideways-bent control points; a
  minimum-jerk speed profile (slow–fast–slow) at ~60 Hz with fading tremor; a duration from
  Fitts' law; one time in four on a long way, a few-px overshoot and a correction; a press
  near — not on — the centre, after a short settle, held 65–140 ms.
- **What it reports.** `none` (nothing to tick, also invisible v2/v3 and Turnstile),
  `already-solved`, `solved`, `challenge` (left alone), `failed` (with a `note`).
- **The window comes up.** A hidden page (a minimized window, or one fully covered by another
  app on macOS) paints no frames, and Chrome then never delivers — never even acknowledges — a
  CDP mouse event. So the tab is activated, its window focused (un-minimized), and the click
  goes ahead only once the page reports `document.hidden === false`.
- A checkbox frame whose content script does not answer (a tab opened before the extension
  was reloaded) is `failed` with "reload the tab", not `none`.
- Permissions this adds: `debugger`, `webNavigation`.

The e2e (`playwright test captcha`) serves stand-in widgets at the real widget URLs, which
tick only on a trusted click that lands on the box — the providers' public test keys are
refused by both of them now.

## Password manager

The same extension is a small password manager for employer portals. It runs on **every https
page** (plus loopback http, for tests), not only on the supported ATSes, and does nothing — mounts
nothing — on a page without a sign-in or sign-up form. Its widget sits bottom-left (the form
filler's panel is bottom-right).

```
page ── content script ──▶ background worker ──▶ localhost server ──▶ credentials.json
 (find the form, fill)      (names the origin)     (match / reveal)     (private data repo)
```

| Situation                                                                             | Behaviour                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in form, one saved login for exactly this host                                   | filled by itself (top frame only; switch off in Settings)                                                                                                                                                                                                                                  |
| Several saved logins, or one from a related subdomain                                 | listed in the widget; **Fill login** fills the one you pick                                                                                                                                                                                                                                |
| Two-step sign-in ("e-mail → Next → password")                                         | each step is filled as it appears                                                                                                                                                                                                                                                          |
| Sign-up form, no account yet                                                          | **Create account**: generates a unique password, **saves it before anything is submitted**, fills e-mail (twice if asked), password(s), the profile's name/phone, and ticks only the terms / privacy boxes the account needs — never marketing, newsletter, job-alert or talent-pool boxes |
| The portal refuses the password                                                       | **New password**, **Letters & digits only** (the generator respects `maxlength`)                                                                                                                                                                                                           |
| A sign-in you did by hand succeeds                                                    | "Save password?" — or silently, with _Save new logins without asking_ on                                                                                                                                                                                                                   |
| Change-password forms, honeypot fields, an e-mail box in a footer or newsletter strip | left alone                                                                                                                                                                                                                                                                                 |

It fills and saves; it never presses the site's own Sign in / Create account button. Success is
read from the page after the submit — the form is gone and no error text shows — not assumed.

**What keeps it safe.**

- Passwords live **only** in `credentials.json` in your private data repo (same no-public-remote
  rule as `profile.json`). Nothing is stored in the extension, and nothing in this repo.
- The server hands a password only to **this extension's pinned id** (`EXTENSION_ID`, fixed by the
  public `key` in `wxt.config.ts`; a store build sets `AUTOFILL_EXTENSION_ID`). Any extension can
  send `Origin: chrome-extension://…`, so the origin check alone is not enough.
- The page never says which site it is on. The service worker takes the origin from the browser's
  own `sender.url`, and the store only returns an entry whose domain fits it: exact host, or the
  same registrable domain — **never across a multi-tenant host** (one Workday tenant never gets
  another's password), never on a look-alike (`evil-acme.com`), never on plain http.
- Sign-in lists carry no passwords. A password crosses once, at the moment of a fill, and a
  submitted password waits in `storage.session` (memory, per tab, five minutes) until the next
  page shows whether it worked.
- Records marked `"status": "UNUSED …"` are kept but never offered; unknown fields survive a rewrite.

`credentials.json` is schema 2 (`id`, `domain` = the exact host, `login`, `password`, `verified`,
`createdAt`, `updatedAt`, `lastUsedAt`, `createdBy`); schema-1 files are read as they are and
upgraded on the next save. `verified: false` is an account the extension created that no
sign-in has confirmed yet. The CLI (`.claude/skills/apply-to-jobs/scripts/credentials.mjs`:
`status`, `list`, `get`, `add`, `verify`, `remove`) works on the same file.

**Reloading.** Reload the extension in `chrome://extensions` once (the manifest carries a `key`,
so Chrome assigns it the pinned id). After that it reloads itself within ~30 s of every
`pnpm --filter @applier/extension build`, as long as `pnpm dev:server` is running (the server
reports the build's mtime; the widget's `data-built` shows which build is live).

## Test

```sh
pnpm check                                            # typecheck + lint + format + unit tests
pnpm --filter @applier/e2e exec playwright test fixture   # real Chromium + built extension + real server
pnpm --filter @applier/e2e exec playwright test passwords # the password manager, same setup
pnpm --filter @applier/e2e exec playwright test agent-commands # the MCP path: a real tab opened, filled and submitted by tool calls
LIVE=1 pnpm --filter @applier/e2e test:live           # opt-in: real employer forms, FAKE data, never submitted
# ONLY=<substring> narrows it to one target; CHROMIUM_PATH=<Chromium binary> reuses one you already have.
# It serves a non-English form vocabulary from fixtures/apply-config.test.json (phrases only), so forms in other languages resolve.
```

The e2e runs the **built** extension in a real Chromium against the real plan
server, on a fake profile (`packages/e2e/fixtures/profile.test.json`) and a fixture CV,
so it can never type the real person into a real form. It runs its own server on its own port
(7399, `AUTOFILL_E2E_PORT`) with an empty data repo and an extension built into `.output-e2e/`, so it can
never reach a dev server that holds the real profile and passwords, and refuses to start if the port is taken. It needs a Chromium: either
`pnpm exec playwright install chromium`, or point `CHROMIUM_PATH` at one you already have
(branded Chrome ignores `--load-extension`).

## What it will and will not do

| Field                            | Behaviour                                                                                                                                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, e-mail, phone, links, city | filled from `profile.json`                                                                                                                                                                     |
| Exact `qa[]` answers             | a box gets the entry's `value` (never its agent-facing `answer`; `value: null` = never typed); select/radio only if an option unambiguously matches                                            |
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
