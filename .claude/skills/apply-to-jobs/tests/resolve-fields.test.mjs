import { afterAll, beforeAll, describe, it } from "vitest";
import assert from "node:assert/strict";
import { makeDataDir } from "./helpers.mjs";

const FIELDS = [
  { label: "First name", kind: "text", key: "first", required: true },
  { label: "Imię", kind: "text", key: "imie", required: true },
  { label: "Phone", kind: "tel", key: "phone", required: true },
  { label: "When can you start?", kind: "text", key: "start", required: true },
  { label: "How many years of React experience do you have?", kind: "text", key: "react-text", required: true },
  { label: "How many years of React experience do you have?", kind: "select", key: "react-list", required: true, options: ["0-2 years", "3-4 years", "5+ years"] },
  { label: "Are you allowed to work in Poland legally?", kind: "radio", key: "auth", required: true, options: ["Yes", "No"] },
  { label: "Describe the hardest technical problem you solved", kind: "textarea", key: "story", required: true },
  { label: "What are your pronouns?", kind: "text", key: "pronouns", required: false },
  { label: "Expected salary", kind: "text", key: "salary", required: true },
  { label: "Favourite colour of your first car", kind: "text", key: "odd", required: true },
];

let data;
let byKey;

beforeAll(() => {
  data = makeDataDir();
  data.write("form.json", { host: "jobs.example.invalid", path: "/apply", fields: FIELDS });
  const r = data.run("resolve-fields.mjs", data.path("form.json"), "--json");
  assert.equal(r.status, 0, r.stderr);
  byKey = Object.fromEntries(JSON.parse(r.stdout)[0].fields.map((f) => [f.key, f]));
});

afterAll(() => data.cleanup());

describe("resolve-fields", () => {
  it("structured profile fields resolve, in English and through the Polish vocabulary", () => {
    assert.deepEqual([byKey.first.status, byKey.first.value], ["resolved", "Test"]);
    assert.deepEqual([byKey.imie.status, byKey.imie.value], ["resolved", "Test"]);
    assert.deepEqual([byKey.phone.status, byKey.phone.value], ["resolved", "+48 000 000 000"]);
  });

  it("an exact qa[] question resolves to its answer", () => {
    assert.deepEqual([byKey.start.status, byKey.start.value], ["resolved", "2 weeks"]);
  });

  it("a text box gets the entry's value and a list gets its pick", () => {
    assert.equal(byKey["react-text"].value, "3");
    assert.equal(byKey["react-list"].value, "3-4 years");
  });

  it("a reworded question is not resolved: the agent has to judge it", () => {
    assert.notEqual(byKey.auth.status, "resolved");
  });

  it("a story question is narrative, never resolved", () => {
    assert.equal(byKey.story.status, "narrative");
  });

  it("a policy answer that is an instruction goes to review, not into the box", () => {
    assert.equal(byKey.pronouns.status, "review");
    assert.equal(byKey.pronouns.value ?? null, null);
  });

  it("salary is computed per vacancy, never taken from the profile", () => {
    assert.equal(byKey.salary.status, "runtime");
    assert.equal(byKey.salary.value ?? null, null);
  });

  it("an unknown question is never resolved", () => {
    assert.notEqual(byKey.odd.status, "resolved");
    assert.equal(byKey.odd.value ?? null, null);
  });
});
