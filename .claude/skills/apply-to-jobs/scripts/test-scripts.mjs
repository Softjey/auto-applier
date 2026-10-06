#!/usr/bin/env node
// End-to-end checks of the CLI scripts against the fake person in autofill/fixtures/.
//   node .claude/skills/apply-to-jobs/scripts/test-scripts.mjs
// Each script runs as a subprocess with $APPLIER_DATA_DIR pointing at a temp copy, so
// nothing here can touch a real data repo.

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, "../../../../autofill/fixtures");
const data = mkdtempSync(join(tmpdir(), "applier-data-"));
copyFileSync(join(FIXTURES, "profile.test.json"), join(data, "profile.json"));
copyFileSync(join(FIXTURES, "apply-config.test.json"), join(data, "apply-config.json"));

const run = (script, ...args) =>
  spawnSync("node", [join(HERE, script), ...args], {
    env: { ...process.env, APPLIER_DATA_DIR: data },
    encoding: "utf8",
  });

test("salary-quote: a band above the baseline is quoted", () => {
  const r = run("salary-quote.mjs", "--min=40000", "--max=45000", "--currency=PLN", "--period=month", "--basis=b2b-net");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Quote\s+44,000 PLN\/month net B2B/);
});

test("salary-quote: a quote under the floor exits 3", () => {
  const r = run("salary-quote.mjs", "--min=10000", "--max=12000", "--currency=PLN", "--period=month", "--basis=b2b-net");
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /BELOW FLOOR/);
});

test("salary-quote: an unknown argument fails loudly", () => {
  assert.equal(run("salary-quote.mjs", "nope").status, 1);
});

test("profile-qa: list reads the qa bank", () => {
  const r = run("profile-qa.mjs", "list");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /authorized to work/i);
});

test("resolve-fields: a structured field resolves from the profile, an unknown one does not", () => {
  const form = join(data, "form.json");
  writeFileSync(
    form,
    JSON.stringify({
      host: "jobs.example.invalid",
      path: "/apply",
      fields: [
        { label: "Email", kind: "text", key: "email", required: true },
        { label: "Favourite colour of your first car", kind: "text", key: "q1", required: true },
      ],
    }),
  );
  const r = run("resolve-fields.mjs", form, "--json");
  assert.equal(r.status, 0, r.stderr);
  const [report] = JSON.parse(r.stdout);
  const byLabel = Object.fromEntries(report.fields.map((f) => [f.label, f]));
  assert.equal(byLabel["Email"].status, "resolved");
  assert.equal(byLabel["Email"].value, "test.candidate@example.invalid");
  assert.notEqual(byLabel["Favourite colour of your first car"].status, "resolved");
});

test("check-resume: reports an unconfigured resume as unusable", () => {
  const r = run("check-resume.mjs");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /no resume configured/);
});

test("check-server: reports a stopped server and says how to start it", () => {
  // port 1 is never listening, so this cannot hit a real running server
  const r = run("check-server.mjs", "--port=1");
  assert.equal(r.status, 1);
  assert.match(r.stdout, /NOT running/);
  assert.match(r.stdout, /pnpm dev:server/);
});

test("init-data-repo: --resume-file fills paths.baseResume and refuses a non-pdf", () => {
  const target = join(mkdtempSync(join(tmpdir(), "applier-init-")), "data");
  const bad = run("init-data-repo.mjs", `--dir=${target}`, "--no-git", "--no-pointer", `--resume-file=${join(data, "form.json")}`);
  assert.equal(bad.status, 1);

  const pdf = join(data, "me.pdf");
  writeFileSync(pdf, "%PDF-1.4");
  const ok = run("init-data-repo.mjs", `--dir=${target}`, "--no-git", "--no-pointer", `--resume-file=${pdf}`);
  assert.equal(ok.status, 0, ok.stderr);
  const cfg = JSON.parse(readFileSync(join(target, "apply-config.json"), "utf8"));
  assert.equal(cfg.paths.baseResume, pdf);
});
