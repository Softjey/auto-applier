# The browser this skill needs

Phases 2 and 4 drive a real Chrome under the user's own identity. Which agent
is running decides what the tools are called, not what has to happen — so the
capabilities are named here once, and `SKILL.md` refers to them by capability.
Read the section for the runtime you are, then go back to `SKILL.md`.

Everything else in the skill is runtime-independent: the scripts are plain
Node, the ATS registry is DOM handles, and `profile.json` is data.

## The five capabilities

| capability | used for |
| --- | --- |
| **navigate** | open `vacancy.link`, then the ATS form, in one tab you keep for the whole run |
| **run JS in the page** | `extract-form.js` in Phase 2; reading a value back after writing it in Phase 4 |
| **click / type** | filling the form |
| **upload a file** | the tailored resume PDF |
| **screenshot** | the confirmation pause, and the success indicator after Submit |

If any of these is missing, the run stops at Phase 2 — do not try to apply
through raw HTTP requests, and do not ask the user to paste the form's HTML.

## Claude Code — Claude in Chrome

Tools: `mcp__claude-in-chrome__*` — `navigate`, `javascript_tool`, `computer`,
`file_upload`, `read_page`. If they are not available, ask the user to run
`/chrome`.

**Pick the right Chrome before anything else.** `list_connected_browsers` can
return several instances on one Mac — separate Chrome profiles, each with the
extension installed, all reporting `isLocal: true` and all named `Browser 1/2/3`.
Nothing in that listing says which window the user is looking at, and choosing
wrong is silent: `tabs_context_mcp` and `navigate` just time out after 60 s, which
is indistinguishable from the extension being dead. On 2026-09-06 that cost a
run several minutes of retries and a wrong diagnosis ("the extension is down")
before the real cause surfaced.

So: read `config.browser.claudeInChrome.deviceName` from `$DATA/apply-config.json` and
`select_browser` the deviceId whose **name** matches. Do not store or trust a
deviceId — they are reassigned when an extension reconnects. If no connected
browser carries that name, call `switch_browser`: it prompts every installed
extension and the user clicks Connect in the one they want, naming it in the
process; write the new name back to `$DATA/apply-config.json`.

Two quirks of this integration that the skill's phases are built around:

- **`file_upload` only reads files inside the session's own directories.** The
  resume repo is not one of them unless the user has run
  `/add-dir <resumeRepo>`, which is why Phase 1 copies every PDF into
  `$DATA/runs/<run-id>/<Company>_<vacancyId>/`. That copy is readable only when the
  session was opened in the workspace folder that holds both repos (verified
  2026-10-01); a session opened inside the code repo gets "only files this session is
  allowed to…" for `$DATA/runs/…`. A `data:` URL cannot serve as a test page —
  `navigate` rejects it; serve one from a local port.
- **Tabs live in one MCP tab group, and closing any tab dissolves it.** Every
  other open form then becomes undrivable — verified: one close out of nine was
  enough. So: never click a control that opens a new tab (click once to learn
  the destination, then `navigate` the managed tab there), and never close a tab
  mid-run.
- **Tab hygiene without closing (re-verified 2026-10-01).** A tab you cannot close
  mid-run still must not pile up. Reuse: after a vacancy's success signal is
  recorded, `navigate` the *same* tab to the next vacancy instead of opening a
  new one. Open a new tab only to **park** a form that needs the user (the parked
  tab then stays as the user's to-do). Closing is for the very end of the run,
  once nothing needs driving any more, and then ask the user first if any
  parked tab is still open — the first close dissolves the group and the
  parked tabs become undrivable (`tabs_close_mcp` refuses them: "not in Claude's
  tab group"), so the user closes those by hand.
- **A glitched tab is replaced, not repaired.** After a failed or detached
  `screenshot` (usually right after a Simplify click or a file upload) a tab can
  keep a stale 392x180 viewport, so every coordinate click lands wrong while JS
  still works; `resize_window` does not undo it, a `navigate` does. Check
  `innerWidth` after any "Detached"/"different extension" error, and do the
  click-dependent steps (Yes/No segmented buttons) before the file upload.

Three more that decide how fast a run goes (all seen 2026-09-14):

- **From a LinkedIn posting to the ATS in one call.** The "Apply" anchor is a
  `linkedin.com/safety/go/?url=<encoded target>` link, and returning that
  target is blocked (query-string / token data). Don't return it — go there:

  ```js
  const a = [...document.querySelectorAll("a")].find((e) => e.innerText.trim() === "Apply");
  location.href = decodeURIComponent(new URL(a.href).searchParams.get("url"));
  ```

  then `tabs_context_mcp` shows where the tab landed. No `Apply` anchor at all
  means Easy Apply or a closed posting. Clicking the button instead opens the
  ATS in a tab outside the group.
- **"Permission denied for this action on this domain" right after a
  cross-domain navigation is usually transient.** Wait ~2 s and retry the same
  call once before concluding the site needs a permission grant.
- **An extension reconnect can hand you a new tab group** — the old tab ids are
  gone ("Tab … is not in Claude's tab group"). Call `tabs_context_mcp` with
  `createIfEmpty` and carry on; a filled form in the old group is lost.

**Simplify Copilot** (see `SKILL.md` § Simplify fast path) is a Chrome
extension, so it is there under either agent as long as the tab is the user's own
Chrome. Its panel is a sidebar on the right; find **Autofill This Page** from a
0.4-scale screenshot rather than a remembered coordinate — the panel shifts with
the page width.

## Codex — the bundled `browser` plugin

Tools: the `browser` plugin over the `node_repl` MCP server. Work through
`agent.browsers` — `list()`, `get(id)`, `user.openTabs()`, `user.claimTab(tab)`
— and drive the returned tab with `tab.goto()`, `tab.playwright.evaluate()`,
`tab.playwright.locator()`, `tab.content()` and `tab.screenshot()`. The plugin
ships its own docs under `docs/` in its cache directory; read
`file-uploads.md`, `tab-claiming-chrome.md` and `browser-safety.md` before
Phase 2 rather than guessing the API.

- **Uploads go through the file chooser**, not `setInputFiles`: start
  `tab.playwright.waitForEvent("filechooser")`, click the `input[type=file]`,
  then `chooser.setFiles(["<absolute path>"])`. Absolute paths only. There is
  no directory restriction here, but Phase 1 still copies the PDF into `$DATA/runs/`
  — that copy is what the run's audit trail is made of.
- **Claim the user's own Chrome tab** rather than opening a detached one when
  the user is signed in to a job board; `claimTab` returns a normal
  controllable tab and leaves it where the user can see it.
- The tab-group fragility above is a Claude-in-Chrome property, not a Codex
  one. Everything else in Phase 2 and Phase 4 — read-only first pass, verify
  writes on hostile forms, the confirmation pause — applies unchanged.

## Reading the ATS registry

`ats/*.md` was written against Claude in Chrome, so it says `javascript_tool`
where it means **run JS in the page**. Read it as the capability. A note that
"`javascript_tool` gets blocked on this host" is about the *host's* CSP or
bot-detection reacting to injected script, so expect it to bite any runtime,
and follow the fallback the file gives.

## Getting text into a field that is far below the fold

Scrolling, screenshotting and clicking by coordinate is the slow path, and the
coordinates go stale whenever the page reflows (a file chip changing the page
height was enough). On most forms this is faster and does not drift:

```js
document.querySelector('[name=firstName]').focus()
```

then use the runtime's **type** capability, and read the value back by name.
The keystrokes are real, so React/Angular controlled inputs see them.

Two hosts refused it and needed a real coordinate click to take focus first —
Recruitify and Comeet. If the value reads back empty, fall back to click+type
rather than assuming the write landed.

## When a CAPTCHA appears

Ticking a reCAPTCHA is a hard limit (see `SKILL.md` § Things you never do). The
vacancy stays `SAVED`, and the OneTap note carries every value that was
prepared so the user can finish it in one pass. Filling the form first and
discovering the CAPTCHA at Submit is fine — nothing was sent.

## Keeping the screenshots (Phase 4 step 5)

The evidence rule needs image **files**, not images in the transcript, and under
Claude in Chrome `computer`'s `save_to_disk` writes nothing this session can
reach. What does work is the recorder:

1. `gif_creator {action: "start_recording", tabId}`
2. scroll through the filled form, taking a `computer` screenshot at each
   section — every screenshot becomes a frame
3. `gif_creator {action: "stop_recording", tabId}`
4. `gif_creator {action: "export", tabId, download: true, filename:
   "<Company>_<vacancyId>-filled-form.gif", options: {showWatermark: false,
   showProgressBar: false, showClickIndicators: false, quality: 5}}`
5. `mv ~/Downloads/<filename> $DATA/runs/<run-id>/<Company>_<vacancyId>/filled-form.gif`

The export downloads through the browser, so the file lands in the user's
Downloads folder and is moved from there. Only about half the screenshots
become frames (the recorder samples them), so take one per section rather than
one per form.

Codex's `browser` plugin has `tab.screenshot()`, which returns the image
directly — write it straight to the run folder as `filled-01.png`, `filled-02.png`
and skip the GIF entirely.

## Sign-in and sign-up: the Applier Passwords panel

The autofill extension doubles as the user's password manager (`SKILL.md` § Portals that
require an account). It adds a small panel to the **bottom-left** of any page that shows a
sign-in or sign-up form (the form filler's own panel is bottom-right). Both live in open
shadow roots, so `find` / `read_page` reach them by their accessible names:

| What you want | Control (accessible name) |
| --- | --- |
| fill a saved login | button **Fill login** (the extension also does it by itself when one login fits) |
| generate + fill a new account | button **Create account** |
| the portal refuses the password | **New password**, **Letters & digits only** |
| keep a login the user just typed | **Save** in the "Save password?" prompt |

Rules for driving it:

- **Click the portal's own Sign in / Create account button yourself.** The extension fills,
  never submits.
- The panel (bottom-left) can cover the site's own button, and a `ref` click on a covered
  submit button did **not** submit (verified 2026-10-01 on a mock portal). Minimise the panel
  (×) first, then click the button by coordinates, and confirm the page actually moved on.
- After a failed sign-in many portals reload the form empty and the extension fills the saved
  login again: type a different login only after the reload, and expect the old one back.
- A page with no account form has **no panel** — absence is not an error.
- A small round **!** instead of the panel means the plan server is not running
  (`pnpm --dir autofill dev:server`); start it, do not work around it.
- After the click, give the page a couple of seconds: the extension decides "did it work?"
  from the next page (form gone, no error text) before offering to save.
- Never read a password field's value to "check" the fill: the panel's notice
  ("Filled login …") and the field being non-empty are the check.
