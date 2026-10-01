#!/usr/bin/env node
// Question → theme regression test for lib/story-themes.mjs. Run after touching
// the vocabulary:  node .claude/skills/apply-to-jobs/scripts/test-story-themes.mjs
// Add a row whenever a real form question fell through (English or Polish).

import test from "node:test";
import assert from "node:assert/strict";
import { themesFor, looksLikeAbout, THEMES } from "./lib/story-themes.mjs";

const CASES = [
  ["Describe a time you disagreed with a teammate", "conflict"],
  ["Opisz sytuację konfliktową w zespole i jak ją rozwiązałeś", "conflict"],
  ["Opisz sytuacje konfliktowa w zespole", "conflict"], // no diacritics
  ["Tell me about a time you failed", "failure"],
  ["Opisz porażkę i czego się z niej nauczyłeś", "failure"],
  ["What was the hardest technical problem you solved?", "hardest-problem"],
  ["Opisz najtrudniejszy problem techniczny, który rozwiązałeś", "hardest-problem"],
  ["Describe the most complex frontend problem you solved. What was the biggest risk?", "hardest-problem"],
  ["Tell us about a project where you improved performance", "performance"],
  ["Opisz projekt, w którym poprawiłeś wydajność systemu", "performance"],
  ["Tell me about a time you convinced stakeholders to adopt your idea", "influence"],
  ["Jak przekonałeś zespół do swojego pomysłu?", "influence"],
  ["Describe a time you mentored a junior engineer", "mentoring"],
  ["Czy mentorowałeś mniej doświadczonych programistów?", "mentoring"],
  ["Tell me about a time you learned a new technology quickly", "learning-fast"],
  ["Opisz sytuację, gdy musiałeś szybko nauczyć się nowej technologii", "learning-fast"],
  ["Tell us about a time you worked under a tight deadline", "deadline"],
  ["Opisz projekt realizowany pod presją czasu", "deadline"],
  ["Describe a production incident you handled", "incident"],
  ["Opisz awarię na produkcji, którą obsługiwałeś", "incident"],
  ["What project are you proud of?", "achievement"],
  ["Z jakiego projektu jesteś najbardziej dumny?", "achievement"],
  ["Jakie masz pasje poza technologią?", "outside-work"],
  ["What do you do in your free time?", "outside-work"],
  ["Tell us about any AI workflows, prompts, skills, agents or internal tools you've built", "ai"],
  ["Opisz doświadczenie z narzędziami AI", "ai"],
  ["Describe a time you took ownership beyond your role", "ownership"],
  ["Opisz sytuację, w której wziąłeś odpowiedzialność poza swoim zakresem", "ownership"],
  ["Tell me about an underperforming colleague you dealt with", "people-management"],
  ["Describe a time you led a team through a migration", "leadership"],
  ["Opowiedz o migracji lub przepisaniu systemu", "migration"],
];

for (const [question, theme] of CASES) {
  test(`${theme} ← ${question}`, () => {
    assert.ok(themesFor(question)[theme], `got: ${JSON.stringify(themesFor(question))}`);
  });
}

test("no false positive: 'constraint' is not training", () => {
  assert.equal(themesFor("What constraint did you hit?").mentoring, undefined);
});

test("about-me questions are recognised, EN and PL", () => {
  for (const q of ["Tell me about yourself", "Twoje bio w pigułce", "Opowiedz o sobie", "Please introduce yourself briefly"]) {
    assert.ok(looksLikeAbout(q), q);
  }
  assert.ok(!looksLikeAbout("Describe a time you failed"));
});

test("every theme has English and Polish-ish keys", () => {
  for (const [id, t] of Object.entries(THEMES)) assert.ok(t.keys.length >= 6, id);
});
