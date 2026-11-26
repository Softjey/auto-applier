---
name: resume-render
description: Assemble a ready-to-send resume file — copy CV_Base.html and replace its Title/Summary/Skills placeholders with blocks that already exist. Use when the user has the blocks (from the resume-blocks skill, from an earlier message, or written by hand) and asks for the full CV, a resume file, a copy of the base for this vacancy, or something to send/print to PDF.
---

# Resume render: base CV + blocks → a file

This skill assembles, it does not write. The blocks come in already finished; your job is to get
them into a copy of `data/CV_Base.html` without touching a single word of them or of the base.

If the blocks do not exist yet, this is the wrong skill — the `resume-blocks` skill writes them,
grounded in `skills.csv`. Get them from there (or from the user), then come back here.

**Never** invent a Title, a Summary or a skills line to fill a gap, and never "improve" what you
were given: no rewording, no reordering, no adding a keyword that seems to be missing. A block
that looks wrong is a question for the user, not something to fix here.

`CV_Base.html` is read-only: everything else in the resume — contact line, experience, education,
open source — is the user's own text and is copied verbatim. The only edits ever made to the base
itself are the user's.

## The tool

```bash
node .claude/skills/resume-render/render.mjs blocks.md                   # → data/out/<Position>/…
node .claude/skills/resume-render/render.mjs blocks.md --company="Acme"  # → data/out/Acme-<Position>/…
node .claude/skills/resume-render/render.mjs blocks.md --out=cv.html     # explicit path; "-" = stdout
node .claude/skills/resume-render/render.mjs placeholders                # what the base declares
```

Flags: `--base=<path>`, `--out=<path>`, `--company=<name>`, `--force` (overwrite an existing file).
The blocks file may also arrive on stdin. The script refuses to overwrite without `--force`, and
fails loudly if any placeholder is still in the output.

## The blocks file

Exactly the output shape of `resume-blocks` — paste it into a file as it was written:

```
**Title:** Senior Frontend Developer

**Summary:** Senior Frontend Engineer specializing in React, Next.js and TypeScript, building
scalable web applications for global products. Experienced in frontend architecture, design
systems and accessibility.

**Skills:**
Programming Languages: TypeScript, TS, JavaScript, JS, SQL
Frontend: React, Next.js, Redux, Web Components, Accessibility
Backend & Data: Node.js (NestJS), GraphQL, REST API, PostgreSQL
```

`**` and `#` are optional, `Title:` alone works. The Summary may span several lines — they are
joined into one paragraph. Anything after the skills lines that is not `Category: items`
(the skill's usual notes about gaps and rating-2 tail items) is ignored, so the agent's full
answer can be saved to the file as is.

## Procedure

1. **Collect the blocks.** From the previous message, from a file, or from the user. If Title,
   Summary or the skills lines are missing, stop and ask — do not fill the gap yourself.
2. **Write them to a file** — `blocks.md` in the scratchpad directory is fine; it is an
   intermediate artifact, not something the repo needs.
3. **Run the script**, passing `--company` when the vacancy's company is known — the company and
   the position name the folder, which is the only thing telling one application from another.
4. **Report** the output path. Turning that file into a PDF is again a separate system — the
   `resume-pdf` skill — so mention it exists rather than doing it here.

## Where the file lands

One vacancy — one folder, named `<Company>-<Position>` (position only when no company was given):

```
data/out/Acme-Senior-Frontend-Developer/<resumeFileName>.html
```

The file itself is always named after `resumeFileName` in `data/resume-config.json` (without `.pdf`;
`CV` when it is not set) — that is the name a recruiter sees in their downloads, so it never
carries the company; a leading `!` keeps it at the top of a Finder listing. Do not rename it per
vacancy, and do not fold the vacancy into the filename.

The name may start with `!`, so always quote the path in single quotes when passing it on
(`'data/out/Acme-…/<resumeFileName>.html'`) — an interactive zsh expands `!` inside double quotes.

Regenerating an existing file needs `--force`.

## When the base changes

The script knows three placeholders: `[Position placeholder]`, `[Summary placeholder]`,
`[skills placeholder]`. If the user reworks `CV_Base.html` and the run fails, `placeholders`
shows what the base declares now versus what the script fills. Fixing that means editing the
constants in `render.mjs`, not editing the user's resume to fit the script.
