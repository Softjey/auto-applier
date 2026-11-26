import { afterEach, beforeEach, describe, it } from "vitest";
import assert from "node:assert/strict";
import { makeDataDir } from "./helpers.mjs";

const STAR = {
  situation: "A checkout page loaded slowly for most users.",
  task: "Make the first render fast enough to stop losing orders.",
  action: "Profiled the bundle, split the code by route and cached the product data.",
  result: "The first render became three times faster and drop-offs fell.",
};

const story = (over = {}) => ({
  id: "checkout-speed",
  title: "Faster checkout",
  themes: ["performance"],
  stack: ["React"],
  lang: "en",
  ...STAR,
  ...over,
});

const db = (stories, about = []) => ({ $schemaVersion: 2, stories, about });

let data;
beforeEach(() => {
  data = makeDataDir();
});
afterEach(() => data.cleanup());

const validate = (value) => {
  data.write("stories.json", value);
  return data.run("stories.mjs", "validate");
};

describe("stories validate", () => {
  it("accepts a clean file", () => {
    const r = validate(db([story()], [{ id: "about-short", title: "About me", text: "Frontend engineer.", lang: "en" }]));
    assert.equal(r.status, 0, r.stdout);
  });

  const broken = [
    ["a wrong schema version", { ...db([story()]), $schemaVersion: 1 }, /\$schemaVersion must be 2/],
    ["schema 1 leftovers", db([story({ variants: [] })]), /leftovers of schema 1/],
    ["a non-kebab id", db([story({ id: "Checkout Speed" })]), /kebab-case/],
    ["a duplicate id", db([story(), story({ title: "Again" })]), /duplicate id/],
    ["an unknown theme", db([story({ themes: ["heroics"] })]), /unknown theme "heroics"/],
    ["no themes", db([story({ themes: [] })]), /themes missing/],
    ["a missing STAR part", db([story({ result: "" })]), /result missing/],
    ["a bad lang", db([story({ lang: "de" })]), /lang must be one of en\/pl/],
    ["salary inside a story", db([story({ result: "Got a raise to 30 000 PLN." })]), /salary or money/],
    ["a company-specific section", db([story({ action: "Why Acme: I love the product." })]), /Why <Company>:/],
    ["Cyrillic in an English story", db([story({ task: "Сделать быстрее." })]), /Cyrillic text/],
    ["a short without shortReviewed", db([story({ short: "Made checkout 3x faster." })]), /shortReviewed/],
    ["shortReviewed without short", db([story({ shortReviewed: true })]), /shortReviewed without short/],
    ["an about entry with no text", db([], [{ id: "about-me", title: "About", text: "", lang: "en" }]), /text missing/],
  ];
  for (const [what, value, message] of broken) {
    it(`rejects ${what}`, () => {
      const r = validate(value);
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, message);
    });
  }

  it("only warns about a very long STAR part", () => {
    const r = validate(db([story({ action: "x".repeat(1300) })]));
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /warn .*action is 1300 chars/);
  });

  it("rejects a file that is not JSON", () => {
    data.write("stories.json", "{ not json");
    assert.notEqual(data.run("stories.mjs", "validate").status, 0);
  });
});

describe("stories find, show and coverage", () => {
  beforeEach(() => {
    data.write(
      "stories.json",
      db(
        [story(), story({ id: "team-conflict", title: "Disagreement on the API", themes: ["conflict"], stack: ["Node.js"] })],
        [{ id: "about-short", title: "About me", text: "Frontend engineer.", lang: "en" }],
      ),
    );
  });

  it("find ranks the story that shares the question's theme", () => {
    const out = data.run("stories.mjs", "find", "Tell us about a project where you improved performance").stdout;
    assert.match(out, /Themes it touches: .*performance/);
    assert.ok(out.indexOf("[checkout-speed]") < out.indexOf("[team-conflict]") || !out.includes("[team-conflict]"));
  });

  it("find on a question no story fits says not to stretch one", () => {
    const out = data.run("stories.mjs", "find", "Describe a time you mentored a junior engineer").stdout;
    assert.match(out, /Do NOT stretch one to fit/);
  });

  it("find points a tell-us-about-yourself question at the about texts", () => {
    assert.match(data.run("stories.mjs", "find", "Tell us about yourself").stdout, /reads like a 'tell us about yourself' question/);
  });

  it("show prints the full STAR of one story and fails on an unknown id", () => {
    assert.match(data.run("stories.mjs", "show", "checkout-speed").stdout, /RESULT: The first render/);
    assert.equal(data.run("stories.mjs", "show", "nope").status, 1);
  });

  it("coverage lists the themes with no story", () => {
    const out = data.run("stories.mjs", "coverage").stdout;
    assert.match(out, /performance\s+1\s+checkout-speed/);
    assert.match(out, /No story for: .*mentoring/);
  });

  it("an unknown command prints usage and fails", () => {
    assert.equal(data.run("stories.mjs", "frobnicate").status, 1);
  });
});
