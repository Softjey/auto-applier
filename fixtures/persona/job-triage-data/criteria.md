# Vacancy criteria

Your rules for judging a vacancy. The procedure (Gate 0 to Gate 6) is in the
`job-triage` skill's `gates.md`; this file holds only your numbers and your
decisions.

Update this file whenever a verdict contradicts it. Rules marked
**(provisional)** were proposed, not yet confirmed by real verdicts.

---

## 1. The candidate in one line

Frontend-leaning full-stack engineer (TypeScript / React / Next.js / Node.js)
based in Kraków, ~6 years of commercial experience, currently Senior at about
18 000 PLN/month B2B, looking for a **Senior** role or a hands-on **Lead**
role: remote from Poland, or hybrid/office in Kraków. Does not relocate.

---

## 2. Stack

**Core:** TypeScript, React, Next.js, Node.js. Frontend-leaning; full-stack
on TS is equally good; a Node.js/TypeScript backend role is acceptable but
flag it as backend-only.

### Disqualifying as a core requirement

Java · .NET / C# · Kotlin · Scala · Go or Python as the
primary backend language · PHP / Laravel / WordPress / Drupal · Ruby / Rails ·
Elixir · C++ · Django / Spring Boot · Svelte as the main framework
**(provisional)**.

"Core requirement" means: in the responsibilities, in the must-have list, or
the language of a product the role owns.

### Explicitly fine

- Any of the above under "nice to have", "mile widziane", "a plus".
- Any of the above that the body explicitly demotes to basics.
- An "or" between frameworks or backends ("React or Angular", "PHP or
  Node.js"), as long as the TypeScript option is a real one.
- Python as a secondary language next to a TypeScript core.
- React Native as a secondary skill (a pure RN/mobile role fails Gate 2).
- AI / LLM / agentic-coding work (Claude Code, Cursor, LLM features) — a
  positive signal; mention it in the note. Reject only when the AI work is
  itself Python/MLOps.

### Where the "or" rule stops

- "Comfortable with Java / .NET" is still a requirement.
- "At least two backend technologies" is a second-language requirement.
- The real rejection pattern is hybrid roles where TypeScript is only half the
  job: Java+React, .NET+React, Angular+Node, Python+React.
- Angular as the whole frontend is rejected: no commercial Angular
  experience, so the interview would not pass.

---

## 3. Role type

Must be building web applications: frontend, full-stack, or Node.js backend.

Reject: QA / test automation · DevOps / SRE / platform-only · data / analytics
· native Android/iOS · React-Native-only mobile · game-engine roles (PixiJS,
Unity, Phaser as must-have) · low-code and enterprise platforms (Salesforce,
ServiceNow, SAP, SharePoint/SPFx, Appian, PowerApps, Shopify-theme or
WordPress-theme work) · non-engineering postings.

**Forward Deployed Engineer** (and similar customer-embedded titles) is
`UNDECIDED`, not rejected: the work is custom integration at a client's side,
so the stack and the share of customer-facing work cannot be read from the
title. The question to the candidate is which stack the role uses and how much
is client-facing. Rejected only when the posting makes the work mostly
on-site consulting or the stack fails Gate 1.

**Platform roles** — API gateway / API management configuration, internal
developer portals (Backstage), IaC-heavy work — are `UNDECIDED` on Gate 2 when
TS/React appears in them but is the minor share (plugins, portal UI): the
verdict goes to the candidate with the question whether the TS/React part is
big enough. A role with no TS/React at all, or pure DevOps/SRE (Gate 2 list
above), is still rejected. Reason for caution: platform work moves the CV away
from product frontend/full-stack.

**Architect roles** (Solution / Software Architect) that require "N years as
an architect" are `UNDECIDED` with a question, never saved on their own: the
candidate is aiming at Senior and Lead developer roles, and a pile of
long-shot architect applications blurs the profile. "Java and Spring (or
comparable frameworks)" is satisfied by Node.js/NestJS.

**People-management roles** (Engineering Manager and similar) are rejected
when managing people is the core of the job. A tech-lead-shaped role that is
mostly hands-on is a judgment call: save it and flag the leadership part —
the candidate has mentored junior and mid developers as a senior.

---

## 4. Location

| Mode | Allowed |
|---|---|
| Remote | anywhere in Poland (remote from Poland, or EU-remote that hires in PL) |
| Hybrid | Kraków |
| Onsite | Kraków |

Hybrid is preferred. **Office days: up to 3 per week.** 4–5 office days per
week: save only if the salary ceiling reaches the target (§5), with the office
load flagged; below target → reject on Gate 3; no salary → `UNDECIDED`.

**The `cities` field is not the work model.** Many remote postings list an
office city — trust the description. Reject a hybrid/onsite posting whose
office is outside Kraków with no remote option. A posting with no work model
and a non-qualifying city → `UNDECIDED`.

Relocation, inside or outside Poland → reject.

---

## 5. Salary

Normalise everything to **PLN per month, B2B net (invoice, before VAT)**:

- UoP gross → × 0.95 for the B2B-equivalent; say so in the note. The factor
  gives the same take-home pay, not a premium for unpaid leave or risk.
- Hourly → × 168 h. Annual → ÷ 12. Foreign currency → convert at the current
  rate and say so.

Derivation of × 0.95 (2026 rules, candidate under 26 with ulga dla młodych on
UoP, B2B on ryczałt 12% with full ZUS): 21 000 UoP gross ≈ 15 010 take-home ≈
19 800 B2B net. After the candidate turns 26 the ulga ends and the same UoP
is worth about 17 600 B2B, so × 0.95 only gets more generous. On liniowy 19%
the B2B-equivalent is about 7% higher. Formula for other amounts:
B2B net ≈ (take-home + 2 370) ÷ 0.88, take-home on UoP ≈ 0.72 × gross.

The candidate's current pay is about 18 000 PLN/month B2B; a move has to beat
it clearly.

**The numbers live in `data/profile.json` →
`compensation.strategy`; read them there, never copy them here.**

**Floor = `strategy.floor`**, measured against the **top** of the posted
range. A band whose ceiling only touches the floor is a save with the money
flagged. Reject on salary only when the ceiling is clearly below it.

**Ask = `strategy.baseline`**, or the top of the band when it is higher. A
ceiling at or above the ask is called out in the report, not saved silently.

No salary posted is never a rejection; note "no salary — ask the rate".

**Salary does not override stack.** Good money on a disqualifying stack is
still a rejection.

---

## 6. Companies

| Company | Rule |
|---|---|
| ElevenLabs | Skip — current employer |

Outsourcing / outstaffing houses are judged on the role like anyone else.

---

## 7. Seniority

Target: **Senior**. Accepted: Mid/Senior, Mid+, Regular with a senior-level
salary, Lead/Tech Lead that is hands-on.

- Reject outright: Junior, Intern, Trainee, Praktykant, Staż, Młodszy.
- A plain Mid/Regular role: save only if the ceiling reaches the floor (§5);
  with no salary posted, save and flag "Mid — check the rate".
- **Ceiling on required years: 7+ is the maximum.** A stated requirement of
  7+ years or less is acceptable; above it (8+, 10+) → reject on Gate 6,
  however good the stack or the money. This is about the number the posting
  states, not the title. Quote the number in the note.

---

## 8. Language

Polish (native) and English (C1): never reject for either, or for a posting
written in Polish.

Any other language as a requirement (German, French, Czech, Dutch, …) → reject
on Gate 1.

---

## 9. Case law

Verdicts the candidate corrected or confirmed, newest first. Each entry:
date — company, title — verdict — why.

_None yet._
