import { afterEach, beforeEach, describe, it } from "vitest";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { makeDataDir } from "./helpers.mjs";

let data;
beforeEach(() => {
  data = makeDataDir();
});
afterEach(() => data.cleanup());

const cred = (...args) => data.run("credentials.mjs", ...args);
const HOST = "jobs.example.invalid";

describe("credentials.mjs", () => {
  it("status on an unknown host exits 2 without creating a store", () => {
    const r = cred("status", `--domain=${HOST}`);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /no account/);
    assert.equal(existsSync(data.path("credentials.json")), false);
  });

  it("add stores an unverified account with a generated password", () => {
    const r = cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    assert.equal(r.status, 0, r.stderr);
    const status = cred("status", `--domain=${HOST}`);
    assert.equal(status.status, 1);
    assert.match(status.stdout, /not yet confirmed by a sign-in/);
  });

  it("status never prints the password", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    const store = JSON.stringify(data.read("credentials.json"));
    const password = /"password":"([^"]+)"/.exec(store)?.[1];
    assert.ok(password);
    assert.ok(!cred("status", `--domain=${HOST}`).stdout.includes(password));
    assert.ok(!cred("list").stdout.includes(password));
  });

  it("list --secrets and get do show the password", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    const password = /"password":"([^"]+)"/.exec(JSON.stringify(data.read("credentials.json")))[1];
    assert.ok(cred("list", "--secrets").stdout.includes(password));
    assert.ok(cred("get", `--domain=${HOST}`).stdout.includes(password));
  });

  it("verify marks the account confirmed", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    assert.equal(cred("verify", `--domain=${HOST}`).status, 0);
    const r = cred("status", `--domain=${HOST}`);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /account \(test@example\.invalid\)/);
  });

  it("every host must be verified for status to exit 0", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    cred("verify", `--domain=${HOST}`);
    assert.equal(cred("status", `--domain=${HOST}`, "--domain=careers.another-company.invalid").status, 1);
  });

  it("an account is found from another subdomain of the same site", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    cred("verify", `--domain=${HOST}`);
    assert.equal(cred("status", "--domain=login.example.invalid").status, 0);
  });

  it("remove deletes the account", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=test@example.invalid");
    assert.equal(cred("remove", `--domain=${HOST}`).status, 0);
    assert.equal(cred("status", `--domain=${HOST}`).status, 2);
  });

  it("two generated passwords differ", () => {
    cred("add", `--domain=${HOST}`, "--company=Example", "--login=a@example.invalid");
    cred("add", "--domain=careers.another-company.invalid", "--company=Other", "--login=b@example.invalid");
    const passwords = [...JSON.stringify(data.read("credentials.json")).matchAll(/"password":"([^"]+)"/g)].map((m) => m[1]);
    assert.equal(passwords.length, 2);
    assert.notEqual(passwords[0], passwords[1]);
  });
});
