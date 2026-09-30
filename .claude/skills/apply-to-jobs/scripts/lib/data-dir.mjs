// Where the user's private data lives.
//
// This repo is code and generic knowledge only. Everything about one person —
// profile.json, stories.json, credentials.json, apply-config.json, runs/,
// triage/ — lives in a separate, private "data repo" (see setup-data-repo).
// Every script reaches those files through here, so there is exactly one rule
// for finding them:
//
//   1. $APPLIER_DATA_DIR                       (tests, CI, a second profile)
//   2. the path written in <repo>/.data-dir    (git-ignored; setup-data-repo writes it)
//   3. ../auto-applier-data                    (the default sibling)
//
// The first candidate that is an existing directory wins.

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// lib/ -> scripts/ -> apply-to-jobs/ -> skills/ -> .claude/ -> repo root
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const DATA_DIR_POINTER = join(REPO_ROOT, ".data-dir");
export const DEFAULT_DATA_DIR = resolve(REPO_ROOT, "..", "auto-applier-data");

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const expand = (p) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p);

function candidates() {
  const list = [];
  if (process.env.APPLIER_DATA_DIR) list.push(resolve(expand(process.env.APPLIER_DATA_DIR)));
  if (existsSync(DATA_DIR_POINTER)) {
    const line = readFileSync(DATA_DIR_POINTER, "utf8").trim().split("\n")[0].trim();
    if (line) list.push(resolve(REPO_ROOT, expand(line)));
  }
  list.push(DEFAULT_DATA_DIR);
  return list;
}

/** The data directory, or null when there is none yet (a fresh clone, CI). */
export function findDataDir() {
  return candidates().find(isDir) ?? null;
}

/** The data directory, or an error that says how to create one. */
export function requireDataDir() {
  const dir = findDataDir();
  if (dir) return dir;
  throw new Error(
    "No data repo found. Looked in: " +
      candidates().join(", ") +
      ".\nCreate one with the setup-data-repo skill " +
      "(or: node .claude/skills/apply-to-jobs/scripts/init-data-repo.mjs), " +
      "or point APPLIER_DATA_DIR at an existing one.",
  );
}

/** Absolute path of a file inside the data repo. Throws when there is no data repo. */
export function dataPath(...parts) {
  return join(requireDataDir(), ...parts);
}

/** Like dataPath, but null instead of an error — for optional files such as apply-config.json. */
export function optionalDataPath(...parts) {
  const dir = findDataDir();
  return dir ? join(dir, ...parts) : null;
}
