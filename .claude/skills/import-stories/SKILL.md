---
name: import-stories
description: Build or update the user's stories.json — the STAR stories and about-me texts that essay and "tell us about a time…" form fields are grounded in — from whatever the user hands over (interview-prep docs, notes, a CV, pasted chat, or just talking). No importer script; the agent reads the material itself, sorts it, asks about gaps, and writes a clean file. Use on first setup, after the user adds new material, when the user gives a story as the answer to a form question (apply-to-jobs hands it here), or when they say "add this story", "update my stories", "I have interview prep notes".
---

# Import stories

`stories.json` (in the data repo) is what lets the apply run answer "describe the
hardest problem you solved" without inventing anything. This skill fills it. **The
input can be anything and in any shape** — the agent does the sorting, there is no
parser to feed.

## 1. Get the material

Ask once, in one message:

> Give me whatever you have about your work experience: interview-prep documents
> (.docx, .pdf, .md, Google Docs), notes, old cover letters, your CV, a pasted
> chat — a folder path is fine, so is a mess. If you have nothing written down, say
> so and I will interview you instead (step 4).

Read everything with your own tools (a .docx is a zip: `unzip -p f.docx word/document.xml`
or the docx skill; PDFs via the pdf skill; Google Docs via the Drive connector).
Never ask the user to convert or clean anything first.

## 2. Sort what you read

Go through the material and put each piece into exactly one bucket:

| Piece | Goes to |
| --- | --- |
| A real event from the user's work with a problem, what they did and what came of it | **`stories[]`** (step 3) |
| "Tell me about yourself", an intro, a description of current roles — not tied to one event | **`about[]`** |
| Years of experience, employers, skills, links, notice period, location | **not here** — `profile.json` / the resume (`profile-interview`) |
| Salary, expectations, compensation | **not here, never** — `profile.json` compensation only |
| "Why <Company>", "my trajectory at <Company>", anything addressed to one employer | **drop** — it is that interview's script; "why us" is the user's pick per form |
| Questions the user asks the recruiter, farewells, "next steps" | **drop** |
| Drafts, scripts, translations, prompts to an AI, notes-to-self | **drop** |
| The same story told twice (different interview loops, "Copy of …") | **one entry**: keep the fuller telling, fold in any fact only the other one has |

Tell the user what you dropped, in a short list, so nothing vanishes silently.

**Also sweep `profile.json` `qa[]`** (`profile-qa.mjs list --grep=` / read the file):
entries of `kind: narrative`, or any answer that tells what happened, are stories filed
in the wrong place. Pull the facts out into `stories.json` — including facts only the
`qa[]` answer carries (a download count, a team's name) — then `profile-qa.mjs remove <id>`
the old entry, or, when the question also wants a plain yes/no, rewrite it to the
one-line answer. `qa[]` ends up with facts, policies and short answers only. Tell the
user what moved.

## 3. Write each story

One story = one event, in the user's own facts:

- `situation`, `task`, `action`, `result` — all four, plain prose, first person,
  lightly tidied from the source. **Do not add a fact, a number, a tool or an outcome
  that is not in the material.** A missing Result, a vague "improved a lot", an
  unnamed technology → ask the user; an unfinished story is not stored.
- One language per entry (`lang`: `en` or `pl`). If the source mixes in a translation,
  keep the language the user would apply in and drop the other.
- Nothing about one employer-to-be, nothing about money.
- `title`: a plain description of the event, not a slogan.
- `themes`: 2–5 tags from the fixed vocabulary — run
  `node .claude/skills/apply-to-jobs/scripts/stories.mjs themes` and use only those.
  Tag by what the story would answer (a rejected proposal that was adopted later is
  `influence` + `improvement`, not just `tooling`). If a real question type has no
  theme, add one to `scripts/lib/story-themes.mjs` (with `keys`) rather than inventing
  a tag.
- `stack`: the technologies the story is concrete about (`["React", "Vue"]`); `[]`
  for a story with none. This is what lets a question that names a stack find it.
- `short`: 1–2 sentences, connected first-person prose, only what the STAR says, the
  way the user writes (follow `apply-to-jobs` SKILL.md § Phase 4 item 3 for voice).
  This is what goes into a small box. Set `"shortReviewed": false` — the user has not
  seen it yet. Show the drafts and flip to `true` only on their ok; the apply run
  treats an unreviewed `short` as a draft it must still flag.

Entry shape (the schema is enforced by `stories.mjs validate`):

```json
{
  "$schemaVersion": 2,
  "note": "…",
  "stories": [{
    "id": "kebab-case-unique",
    "title": "…",
    "themes": ["influence", "tooling"],
    "stack": ["TypeScript"],
    "lang": "en",
    "situation": "…", "task": "…", "action": "…", "result": "…",
    "short": "…", "shortReviewed": false
  }],
  "about": [{ "id": "about-me", "title": "Tell me about yourself", "lang": "en", "text": "…" }]
}
```

## 4. Fill the gaps — by asking, never by guessing

```sh
node .claude/skills/apply-to-jobs/scripts/stories.mjs coverage
```

lists themes with no story. Forms and interviews keep asking about: a conflict, a
failure, a hardest problem, ownership, mentoring/helping someone, working under a
deadline, learning something fast. For each uncovered one the user plausibly has,
ask **one open question** ("Is there a time you disagreed with a teammate and how did
it end?"), take whatever they tell you as the raw material, ask for the missing S/T/A/R
piece, then write it as above. Do not interrogate through all themes — stop when the
user says that is enough. A theme left empty is fine: the apply run then asks the
user instead of stretching a story.

No written material at all → this step is the whole skill: start from "what are you
proudest of at work?" and follow up.

## 5. Write, validate, report

- **Updating**: read the existing `stories.json` first. Merge by `id`; never drop or
  rewrite a story the user did not ask about. Show a diff-style summary before saving
  when you change an existing entry.
- Write the file (Edit / Write — it is just JSON), then:
  ```sh
  node .claude/skills/apply-to-jobs/scripts/stories.mjs validate
  ```
  It must print `0 error(s)`. Fix what it names; `warn` lines (a field over 1200 chars)
  mean two stories or a neighbouring section got merged — split it.
- Report: stories added / updated, what was dropped, themes still empty, and the
  `short` drafts awaiting an ok.

## When the user gives a story as the answer to a form question

(`apply-to-jobs` parks a question and the user replies with something that happened.)
Do not put it in `qa[]`. Take their words as the raw material, ask only for the
missing S/T/A/R piece, write the story (steps 3 and 5 — a single entry, merge by `id`),
use its `short` for the box, and set `shortReviewed: true` once they approve the
wording. `qa[]` gets at most a one-line fact if the question also asked yes/no.

## Rules

- **The file is private.** It is in the data repo, never in the code repo, never on a
  public remote.
- **Nothing generated is a fact.** The agent reorganises what the user said; it does
  not embellish, round a number up, name a tool the source did not name, or fill a
  Result "because it probably went well".
- **All stories live here, not in `qa[]`.** `qa[]` is for facts, policies and short answers.
- **Shorts are drafts until the user says ok** (`shortReviewed`).
- This skill has no script of its own and none should be added — the point is that
  any material works. `stories.mjs validate` is the only mechanical check.
