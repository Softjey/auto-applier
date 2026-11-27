import { afterEach, describe, it } from "vitest";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DATA_DIR, REPO_ROOT, dataLocation, findDataDir, requireDataDir } from "../scripts/lib/data-dir.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INIT = resolve(HERE, "../scripts/init-data-repo.mjs");
const saved = process.env.APPLIER_DATA_DIR;
afterEach(() => {
  if (saved === undefined) delete process.env.APPLIER_DATA_DIR;
  else process.env.APPLIER_DATA_DIR = saved;
});

describe("data-dir", () => {
  it("is data/ at the repo root", () => {
    delete process.env.APPLIER_DATA_DIR;
    assert.equal(DEFAULT_DATA_DIR, join(REPO_ROOT, "data"));
    assert.equal(dataLocation(), DEFAULT_DATA_DIR);
  });

  it("follows a symlinked data", () => {
    const tmp = mkdtempSync(join(tmpdir(), "data-dir-"));
    mkdirSync(join(tmp, "real"));
    symlinkSync(join(tmp, "real"), join(tmp, "data"));
    process.env.APPLIER_DATA_DIR = join(tmp, "data");
    assert.equal(findDataDir(), join(tmp, "data"));
  });

  it("names the place and the setup skill when data is missing", () => {
    process.env.APPLIER_DATA_DIR = join(tmpdir(), "no-such-data-dir-xyz");
    assert.equal(findDataDir(), null);
    assert.throws(() => requireDataDir(), /no-such-data-dir-xyz[\s\S]*setup skill/);
  });

  it("is git-ignored", () => {
    const ignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8").split("\n");
    assert.ok(ignore.includes("/data"));
  });
});

describe("init-data-repo", () => {
  const run = (...args) => spawnSync(process.execPath, [INIT, ...args], { encoding: "utf8" });

  it("refuses a folder inside the code repo other than data/", () => {
    const r = run(`--dir=${join(REPO_ROOT, "would-be-data")}`, "--no-git", "--no-link");
    assert.equal(r.status, 1);
    assert.match(r.stderr, /only data\/ is allowed/);
    assert.equal(existsSync(join(REPO_ROOT, "would-be-data")), false);
  });

  it("creates the repo elsewhere without CLAUDE.md", () => {
    const target = join(mkdtempSync(join(tmpdir(), "init-")), "my-data");
    const r = run(`--dir=${target}`, "--no-git", "--no-link");
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(target, "profile.json")));
    assert.equal(existsSync(join(target, "CLAUDE.md")), false);
    assert.equal(lstatSync(DEFAULT_DATA_DIR, { throwIfNoEntry: false }), undefined);
  });
});
