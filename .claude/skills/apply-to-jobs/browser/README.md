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

Two quirks of this integration that the skill's phases are built around:

- **`file_upload` only reads files inside the session's own directories.** The
  resume repo is not one of them unless the user has run
  `/add-dir <resumeRepo>`, which is why Phase 1 copies every PDF into
  `runs/<run-id>/<Company>_<vacancyId>/`.
- **Tabs live in one MCP tab group, and closing any tab dissolves it.** Every
  other open form then becomes undrivable — verified: one close out of nine was
  enough. So: never click a control that opens a new tab (click once to learn
  the destination, then `navigate` the managed tab there), and never close a tab
  mid-run.

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
  no directory restriction here, but Phase 1 still copies the PDF into `runs/`
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
