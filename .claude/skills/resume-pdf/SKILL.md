---
name: resume-pdf
description: Convert a local HTML file into a PDF that is one single continuous page — the paper height equals the content height, so nothing is split across pages. Use when the user wants a PDF of a resume (or any local HTML), a file to send to a recruiter or upload to a job application, or asks to "print it to PDF" / "make a one-page PDF".
---

# HTML → one long PDF page

This skill converts, it does not author. It takes an HTML file that already exists and prints it
through a headless Chromium with a custom paper size: the page is as tall as the content, so the
result is a single page with no page breaks, however long the document turns out to be.

If the HTML for this vacancy does not exist yet, this is the wrong skill — `resume-render`
assembles it from the base CV and the blocks. Convert only what is already on disk, and never
edit the HTML to make it fit: reflowing the resume is the user's call, not a side effect of
making a PDF.

## The tool

```bash
node .claude/skills/resume-pdf/topdf.mjs 'data/out/Acme-Senior-FE/<resumeFileName>.html'  # → ….pdf
node .claude/skills/resume-pdf/topdf.mjs cv.html --out=resume.pdf    # explicit path
node .claude/skills/resume-pdf/topdf.mjs cv.html --width=210 --pad=8 # page width, bottom pad (mm)
node .claude/skills/resume-pdf/topdf.mjs cv.html --side=14           # left/right margins (mm)
node .claude/skills/resume-pdf/topdf.mjs cv.html --scale=0.95        # shrink the content
node .claude/skills/resume-pdf/topdf.mjs browsers                    # which Chromium it will use
```

Flags: `--browser=<path>` (or `CHROME_PATH`), `--force` to overwrite an existing PDF.
Defaults: A4 width (210 mm), 8 mm of bottom padding, scale 1.

Side margins are not the script's — they come from the HTML itself (the Google Docs export gives
`CV_Base.html` a body with `padding: 9pt 57.6pt`, i.e. 20.3 mm each side, plus a `max-width`).
`--side` overrides both at print time, in the browser, leaving the file untouched; without the
flag the PDF keeps whatever the HTML says. Changing the margins reflows the text, so the page
gets shorter — that is measured after the override, so the single-page guarantee still holds.

No npm dependencies — the script drives Chromium over the DevTools protocol using Node's built-in
`WebSocket`. It needs some Chromium on the machine and finds one itself: a Playwright/Puppeteer
cache first, then Chrome, Chromium, Edge, Brave, Arc.

## How it works, and what can go wrong

The script loads the file, switches the page to print media, measures the rendered content height
at the target paper width, and prints with `paperHeight = content + padding` and zero margins.
Then it counts the pages in the result: if the PDF ends up with more than one page, the run fails
loudly instead of quietly handing over a split resume.

- **The output has 2 pages** — the measurement was off by a hair. Raise `--pad` a little and rerun.
- **Content is cut off on the right** — the HTML is laid out for a different width; pass the width
  it was designed for via `--width`, do not "fix" the HTML.
- **No Chromium found** — pass `--browser=<path>` or install Chrome. Do not fall back to any other
  converter: the point of this one is the exact page height.
- **A recruiter portal insists on A4 pages** — say so plainly. A single tall page is what this
  skill makes; regular paginated A4 comes from printing the HTML in a browser by hand.

## Procedure

1. Take the HTML path from the user (or the one `resume-render` just wrote). Without `--out` the
   PDF lands next to it under the same name, which is what the vacancy folder wants. Quote paths
   in single quotes — resume files start with `!`, and an interactive zsh expands it inside
   double quotes.
2. Run the script. Add `--force` only when the user is regenerating a file they already have.
3. Report the output path and the page size it produced (e.g. `210×293 mm`), so the user knows how
   long the sheet is before sending it anywhere.
