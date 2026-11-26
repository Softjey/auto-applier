import { afterEach, beforeEach, describe, it } from "vitest";
import assert from "node:assert/strict";
import { makeDataDir } from "./helpers.mjs";

let data;
beforeEach(() => {
  data = makeDataDir();
});
afterEach(() => data.cleanup());

const find = (q) => JSON.parse(data.run("profile-qa.mjs", "find", q, "--json").stdout);
const entry = (id) => data.read("profile.json").qa.find((e) => e.id === id);

describe("profile-qa find", () => {
  it("the recorded question is an exact match", () => {
    const [top] = find("When can you start?");
    assert.equal(top.id, "test-availability");
    assert.equal(top.verdict, "exact");
  });

  it("a reworded question is only likely, never exact", () => {
    const [top] = find("Are you legally allowed to work in Poland?");
    assert.equal(top.id, "test-authorized-poland");
    assert.equal(top.verdict, "likely");
  });

  it("an alias added for a new phrasing then matches exactly", () => {
    assert.equal(data.run("profile-qa.mjs", "alias", "test-availability", "--add=What is your notice period?").status, 0);
    const [top] = find("What is your notice period?");
    assert.equal(top.id, "test-availability");
    assert.equal(top.verdict, "exact");
  });
});

describe("profile-qa add", () => {
  const add = (...args) => data.run("profile-qa.mjs", "add", ...args);

  it("writes a new entry with its kind and value", () => {
    const r = add("--question=Do you have a driving licence?", "--answer=Yes, category B.", "--canonical=driving_licence", "--kind=fact", "--value=Yes");
    assert.equal(r.status, 0, r.stderr);
    const e = data.read("profile.json").qa.find((x) => x.canonicalTopic === "driving_licence");
    assert.equal(e.kind, "fact");
    assert.equal(e.value, "Yes");
    assert.equal(e.answer, "Yes, category B.");
  });

  it("refuses a second entry for the same canonical topic and points to alias", () => {
    add("--question=Do you have a driving licence?", "--answer=Yes", "--canonical=driving_licence", "--kind=fact", "--value=Yes");
    const before = data.read("profile.json").qa.length;
    const r = add("--question=Do you hold a driving licence?", "--answer=Yes", "--canonical=driving_licence", "--kind=fact", "--value=Yes");
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /already exists[\s\S]*alias/);
    assert.equal(data.read("profile.json").qa.length, before);
  });

  it("refuses a long narrative: stories live in stories.json", () => {
    const r = add("--question=Tell me about a project", `--answer=${"word ".repeat(120)}`, "--canonical=project_story", "--kind=narrative", "--no-value");
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /stories live in stories\.json/);
  });

  it("requires a kind", () => {
    const r = add("--question=Q?", "--answer=A", "--canonical=q_topic");
    assert.equal(r.status, 1);
    assert.equal(data.read("profile.json").qa.some((x) => x.canonicalTopic === "q_topic"), false);
  });
});

describe("profile-qa maintenance", () => {
  it("set-value writes the form value and keeps the answer", () => {
    assert.equal(data.run("profile-qa.mjs", "set-value", "test-availability", "--value=2 weeks").status, 0);
    assert.equal(entry("test-availability").value, "2 weeks");
    assert.equal(entry("test-availability").answer, "2 weeks");
  });

  it("set-value on an unknown id fails", () => {
    assert.equal(data.run("profile-qa.mjs", "set-value", "nope", "--value=x").status, 1);
  });

  it("remove deletes the entry", () => {
    assert.equal(data.run("profile-qa.mjs", "remove", "test-pronouns").status, 0);
    assert.equal(entry("test-pronouns"), undefined);
  });

  it("list filters by tag and text", () => {
    const byTag = data.run("profile-qa.mjs", "list", "--tag=availability").stdout;
    assert.match(byTag, /test-availability/);
    assert.doesNotMatch(byTag, /test-contract/);
    assert.match(data.run("profile-qa.mjs", "list", "--grep=contract").stdout, /test-contract/);
  });

  it("the profile stays valid JSON after a series of writes", () => {
    data.run("profile-qa.mjs", "alias", "test-contract", "--add=Contract type");
    data.run("profile-qa.mjs", "set-value", "test-contract", "--value=B2B");
    data.run("profile-qa.mjs", "touch", "test-contract");
    assert.equal(entry("test-contract").aliases.includes("Contract type"), true);
  });
});
