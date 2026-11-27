---
name: resume-blocks
description: Write the Title, Summary and Skills blocks of a resume for one specific job posting, grounded in the rated skills in skills.csv. Use whenever the user pastes a vacancy (or a link/ID to one) and wants a tailored resume headline, professional summary, skills section, or "adapt my resume to this job".
---

# Resume blocks: Title + Summary + Skills

You read the vacancy and decide what matters — that judgement is yours, not the script's.
The user's files live in `data/` at the repo root: `data/skills.csv`, `data/CV_Base.html`,
`data/resume-config.json`.

`skills.mjs` is only a fact-checker over `skills.csv`: it answers "how strong is this skill,
and is it in the base at all". Never let it pick skills for you, and never claim a skill
it does not back.

## The tool

```bash
node .claude/skills/resume-blocks/skills.mjs rate "React" "Next.js" "Rust"   # ratings for terms you chose
node .claude/skills/resume-blocks/skills.mjs search "state management"       # how the base names something
node .claude/skills/resume-blocks/skills.mjs list --min=4 --grep=test        # browse the base
node .claude/skills/resume-blocks/skills.mjs check draft.txt "React" "Kafka" # skills draft vs vacancy terms
```

Flags: `--json`, `--limit=<n>`, `--min/--max=<n>`, `--grep=<text>`, `--csv=<path>`.
`rate` also reads one term per line from stdin. Verdicts:

| verdict | meaning |
| --- | --- |
| `use freely` | rating 4–5 |
| `plain in skills block, hedged in prose` | rating 3 |
| `skills block only, last on its line` | rating 2, and only if the vacancy asks for it |
| `NEVER claim` | rating 0–1 |
| `NEVER claim (no rating yet)` | in the base, still unrated |
| `NOT IN BASE` | no such row — unknown skill |
| `ambiguous` | the matcher is unsure; read the candidate list and decide yourself |

`skills.csv` is read-only here. If the vacancy exposes a real gap in the base, tell the user —
do not edit the file.

## Procedure

1. **Read the vacancy yourself.** Pull out: the exact role title, seniority, what the product
   actually is, the domain, must-haves vs nice-to-haves, and which technologies/practices the
   posting keeps coming back to. Recurrence and placement (title > requirements > nice-to-have)
   are your priority signal.
2. **Draft a candidate list** of 10–20 terms in the vacancy's own spelling, ordered by how
   central each is to *this* posting.
3. **Rate them in one call.** For `ambiguous` rows, look at the candidates and choose the row that
   really matches (or conclude there is none). For `NOT IN BASE`, try `search` with a different
   wording before treating it as unknown.
4. **Write the Title, then the Summary, then the Skills block**, using only what survived the
   gates below.
5. **Self-check**: `rate` every meaningful noun phrase in the Title and Summary — not just the
   obvious technologies, but also practice areas, scale words and product descriptors
   (`heavy data pipelines`, `high-traffic`, `multi-tenant`). Anything under 3, unrated, or not in
   the base must be cut; a phrase that maps nowhere is borrowed from the posting, so cut it too.
   Then read the Summary once against the portability test below. Run `check` on the Skills block
   and add whatever it reports as MISSING.
6. **Check what the gates deleted**, which `check` cannot see: compare the posting's minimum years
   against the count and open sentence 1 with it if it clears; then walk the requirements you
   dropped for rating ≤1 and ask, per requirement, whether a category substitute or a language
   foundation belongs in the block instead. Then output.

## Rating gates

- **4–5** — write plainly, may lead sentence 1 and appear in the Title.
- **3** — in prose (Title/Summary) only with hedged framing ("hands-on experience with",
  "working knowledge of"), max 2 items, never in sentence 1, never in the Title. In the Skills
  block a 3 needs no hedge — it is listed like any other item, just later in its line.
- **2** — Skills block only, and only if the vacancy asks for it: it goes at the very end of its
  line, after everything stronger, so the keyword is covered without drawing attention. Never in
  the Title or Summary, and never added on your own initiative.
- **0–1, unrated, not in base** — never appears in any block, no matter how central it is to the
  vacancy. Report it to the user as a gap instead of writing around it.

Same rule for domains: `FinTech`, `Healthcare`, `E-commerce` etc. are rows in the base too.
If the domain rates below 3, describe the product neutrally ("high-traffic consumer platforms",
"global products") instead of claiming industry experience.

## Title

Mirror the vacancy's title — an ATS compares it literally — then clean it.

- **Strip**: company name, industry/domain parenthetical `(Fintech)`, `(m/f/d)`, `(f/m/x)`,
  location, `Remote`/`Hybrid`/`On-site`, employment type, req IDs, seniority ranges (`Mid/Senior`
  → pick the higher one that fits), marketing words (`Rockstar`, `Ninja`, `Guru`, `100% remote`).
- **Keep**: the seniority word and the role wording exactly as the vacancy writes it —
  `Developer` vs `Engineer`, `Frontend` vs `Front-end`, `Full Stack` vs `Fullstack`.
- **Tech in the title** only if it rates 4–5. `Senior React Developer` → keep. `Senior Rust
  Developer` → drop the tech, use the plain role.
- **Non-standard titles** map to the nearest standard one: `Software Craftsperson` →
  `Software Engineer`, `Frontend Wizard` → `Frontend Developer`.
- 2–5 words, one line, no company, no punctuation clutter.

| vacancy title | your Title |
| --- | --- |
| `Senior Frontend Developer (Fintech)` | Senior Frontend Developer |
| `Senior Frontend Engineer (m/f/d) — Berlin, Hybrid` | Senior Frontend Engineer |
| `Middle/Senior Full Stack Engineer @ Acme` | Senior Full Stack Engineer |
| `Senior React Developer (Next.js)` | Senior React Developer |
| `Senior Go Engineer` (Go rates 1) | — refuse the block, tell the user the stack does not match |

## Summary

2–3 sentences, 40–75 words, third person without pronouns, written so an ATS reads the keywords
and a human reads a person.

- **Sentence 1** — seniority + the role from the Title + `specializing in` 3–4 of the highest-rated
  technologies the vacancy actually asks for + what kind of product this is.
- **Sentence 2** — breadth: the architecture/practice areas the posting emphasises (rating ≥4),
  grouped in comma lists of at most four items.
- **Sentence 3** (optional) — the hedged rating-3 items, plus leadership/product/communication
  angles if the vacancy asks for them.

Rules:

- Use the vacancy's spelling of every term (`Next.js`, not `NextJS`; `CI/CD`, not `CI and CD`).
- 8–12 technology keywords in total — beyond that it reads as keyword stuffing and dilutes ATS
  scoring per keyword.
- No first person, no `I`, no `passionate/results-driven/team player`.
- No invented numbers: team sizes and `%` improvements only if the user gave them. Years of
  experience are a verified fact — see below — not an invented number.
- Do not repeat the same keyword in every sentence; the Title already carries the role words once.

### Years of experience

Never take the number from memory and never hardcode it — read it off the base CV. Open
`data/CV_Base.html`, go to its EXPERIENCE section, and take the start year of **the earliest entry that
is commercial software development**; the count is the current year minus that year.

The earliest entry is not automatically the right one. A CV also lists work from before the career
started — hardware, support, sales, unrelated internships — and those years are dated just like the
rest but do not count. If the CV has no EXPERIENCE dates at all, ask the user which year to count
from.

Lead sentence 1 with it **only when the posting's minimum is at or below** what that yields
(`Software Engineer with N+ years of experience specializing in …`). It is the cheapest way to
clear an ATS year-filter and a recruiter's first scan.

When the posting asks for **more** years than the count, say nothing about the number at all — do not
hedge it, do not round up, do not write `several years`. Silence is correct there; the dates in
EXPERIENCE let the reader do the arithmetic. Report the gap to the user instead, so they know
before applying.

### A profile, not a job description

The strongest pull of this task is to echo the posting back. Resist it: the Summary describes the
engineer, and it is read next to every other application, so wording that only makes sense for
this one employer makes it look copy-pasted.

- **Portability test.** Every sentence must still be true and natural if the same person applied
  to a different company with the same role. `Experienced in building heavy data pipelines for
  logistics forecasting` fails it. `Experienced in backend architecture and API design` passes.
- **The base is the vocabulary.** A noun phrase belongs in the Summary only if it maps to a
  `skills.csv` row that clears the gate (4–5 plain, 3 hedged). Everything else is either plain
  English glue (`building`, `scalable`, `experienced in`) or borrowed from the posting — cut it.
  Verify by `rate`-ing the phrase: `heavy data pipelines` → `Data Pipelines (1)` → it does not go
  in, and there is nothing to soften it into.
- **Never carry over the employer's work items**: internal system names, business processes and
  domain tasks — `claims processing`, `real-time bidding`, `matching engine`, `heavy data
  pipelines`, `driver dispatch`. These belong in a cover letter or in bullet points about past
  projects, never in the Summary.
- **Generalise instead of borrowing.** A task phrase often has a legitimate skill inside it: keep
  the skill in the base's neutral wording, drop the employer-specific half. `real-time driver
  dispatch` → `Real-time Systems (4)` → write `real-time systems`. `multi-tenant billing` →
  `Multi-tenant Systems (1)` → nothing survives, so write nothing at all.
- **Product context is one neutral phrase**, six words at most, about the *class* of product
  (scale, audience, delivery model) — not about the employer's business problem. `for global
  products`, `for high-traffic consumer platforms`, `for B2B SaaS products`. Even this needs
  backing: use a scale/model word only when its row clears the gate (`High-load Systems`,
  `SaaS`, `B2B`). When nothing backs it, `for global products` is the safe default. Drop the
  industry entirely if the domain row rates below 3.
- **Do not borrow the posting's intensity adjectives** (`heavy`, `massive`, `mission-critical`,
  `hyper-scale`) — they are claims about scale, and they need a rating behind them just like a
  technology does.

Same vacancy, both grounded in the same ratings:

- Borrowed: `Senior Backend Engineer building heavy data pipelines and real-time driver dispatch
  for a logistics marketplace, working on mission-critical forecasting workloads.`
- Portable: `Senior Backend Engineer specializing in Node.js, NestJS and PostgreSQL, building
  distributed, event-driven services for global products.`

Reference (this is the target register):

> Senior Frontend Engineer specializing in React, Next.js and TypeScript, building scalable,
> performance-critical web applications for global products. Experienced in frontend architecture,
> design systems, reusable component libraries, accessibility and high-traffic user flows.
> Strong product mindset with hands-on backend/API experience and technical leadership.

Bad, for contrast: `I am a passionate Senior Developer with 10+ years of experience in React,
Angular, Vue, Svelte, Rust, Kubernetes and Terraform, delivering results-driven solutions.` —
first person, invented years, unrated and low-rated tech, no product context.

## Skills block

Grouped keyword lines, one category per line — the densest ATS surface of the resume:

```
Programming Languages: TypeScript, TS, JavaScript, JS, SQL, Python
Frontend: React, Next.js, Lit.js, Web Components, Redux, Accessibility, Vue, Angular, Tailwind CSS
Backend & Data: Node.js (NestJS), GraphQL, REST API, noSQL, Redis, Kafka, MongoDB, gRPC
Infrastructure & Cloud: GCP, AWS, Docker, CI/CD, System Design, Microservices, Grafana, Loki
Data Analysis, AI & ML Tools: Pandas, NumPy, Scikit-learn, Matplotlib, Seaborn
Engineering Practices: TDD, Mentoring, Technical Leadership, Performance Optimization
```

That is an illustration of the shape, not a fixed taxonomy.

### Categories

- Invent the categories for *this* vacancy. If the posting is frontend-heavy, split the frontend
  into two lines (`Frontend`, `UI & Design Systems`) and collapse the rest. If it is an AI role,
  `AI & LLM Tooling` deserves its own line. If the posting itself groups its tech stack, mirror
  those groups and their naming.
- Order categories by how central they are to the vacancy — the first line must be the one the
  hiring manager is scanning for.
- 4–7 categories, each with at least 3 items. A category with fewer items gets merged into a
  neighbour rather than left thin.

### What goes in — the completeness rule

**Every** term the vacancy mentions as a requirement, tech stack item, nice-to-have or
responsibility that exists in `skills.csv` with a rating of **3 or more** must appear somewhere in
the block. No omissions — this block is where recall matters more than elegance. Run `check` to
prove it: whatever it lists under MISSING has to be added before you output.

Vacancy terms rated **2** belong here too, but only at the end of their line — the keyword gets
covered for the ATS without the resume claiming strength that is not there. `check` lists them
under OPTIONAL; adding them is the default, skipping one is a deliberate choice.

After that coverage is complete, top the lines up with strong skills that the vacancy does *not*
mention but that show real depth — rating 5 first, then 4. Never pad with rating-3 or rating-2
items the vacancy did not ask for, and keep the additions to roughly a third of each line so the
vacancy's own keywords stay dominant.

### Two things the gates must never delete

The gates cut individual terms. Applied literally they also cut two things the resume cannot
afford to lose — check both before you output.

**Cover the category, not just the term.** When a vacancy asks for a *kind* of technology and the
specific product it names rates ≤1, the requirement is still live: put in whatever the base does
have in that category at rating ≥3. Dropping the named tool is honest; dropping the whole category
just hands back a requirement that could have been met.

| vacancy names | rates | what still goes in |
| --- | --- | --- |
| Azure / AWS (cloud) | 1 | `GCP` (3), `Docker`, `Cloud-native`, `CI/CD` |
| Kubernetes (orchestration) | 1 | `Docker`, `Docker Compose` |
| Celery (background work) | 0 | `Background Jobs` (4), `Message Queues` (4), `Redis` |
| PrimeReact (component library) | 1 | `Material UI / MUI` (5), `Component Libraries` |
| SQLAlchemy (ORM) | 0 | `Prisma ORM` (5), `TypeORM`, `Sequelize` |

The substitute is never presented as the thing they asked for — it is simply the neighbouring
skill on its line. A cloud line reading `GCP, Docker, CI/CD, Cloud-native` answers "do they ship
to a cloud?" without ever claiming Azure. If the base has nothing at all in the category, that is
a real gap: report it to the user.

**Keep the foundation under a named framework.** A framework in the block implies its language,
and ATS filters frequently scan for the language rather than the framework. Whenever a
vacancy-required technology sits on top of something rated ≥4 in the base, that foundation stays
in the block even if the posting never spells it out: React/Next.js/Vue → `JavaScript`;
NestJS/Express → `Node.js`; FastAPI/Flask/Django → `Python`; PostgreSQL/MySQL → `SQL`; any ORM →
`SQL`. These are cheap, true, and the first thing a keyword filter looks for.

### Order inside a line

1. vacancy-required, rating 5–4 — in the vacancy's own order of importance;
2. vacancy-required, rating 3;
3. not in the vacancy, rating 5;
4. not in the vacancy, rating 4;
5. vacancy-required, rating 2 — always last, after everything above.

### Formatting

- Use the vacancy's spelling for anything it names (`noSQL`, `CI/CD`, `Next.js`).
- ATS abbreviation pairs are allowed for the most important items — `TypeScript, TS` — max 3 pairs
  in the whole block, and only when the full name itself rates ≥3.
- Parentheses group a technology with what runs on it: `Node.js (NestJS, Express)`.
- 6–12 items per line, 35–60 in the whole block; never repeat an item in two categories.
- Never create a category just to house a skill that failed the gates.

## Output

```
**Title:** <title>

**Summary:** <2–3 sentences>

**Skills:**
<category lines>
```

This skill ends with the blocks. Putting them into a resume file is a separate system —
the `resume-render` skill copies `CV_Base.html` and fills its placeholders. Never edit
`CV_Base.html` from here.

Then, briefly:

- which strong skills you added beyond what the vacancy asked for;
- which vacancy requirements you deliberately left out because they rate ≤1 / are missing from
  the base (this is the honest gap list the user needs before applying), and for each one whether
  a category substitute covered it or the category went uncovered entirely;
- whether the posting's minimum years is cleared, and by how much it is missed if not;
- which requirements are in the block only as rating-2 tail items, so the user knows where the
  interview will press.
