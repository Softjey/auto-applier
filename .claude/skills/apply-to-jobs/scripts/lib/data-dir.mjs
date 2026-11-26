import { existsSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../../../../..");
export const DEFAULT_DATA_DIR = join(REPO_ROOT, "data");

const expand = (p) => (p === "~" || p.startsWith("~/") ? join(homedir(), p.slice(1)) : p);

export function dataLocation() {
  const override = process.env.APPLIER_DATA_DIR;
  return override ? resolve(expand(override)) : DEFAULT_DATA_DIR;
}

export function findDataDir() {
  const dir = dataLocation();
  return existsSync(dir) && statSync(dir).isDirectory() ? dir : null;
}

export function requireDataDir() {
  const dir = findDataDir();
  if (dir) return dir;
  throw new Error(
    `No data repo found at ${dataLocation()}.\n` +
      "Create one with the setup-data-repo skill " +
      "(or: node .claude/skills/apply-to-jobs/scripts/init-data-repo.mjs): " +
      "data/ at the repo root is a clone of your private data repo or a symlink to it.",
  );
}

export function dataPath(...parts) {
  return join(requireDataDir(), ...parts);
}

export function optionalDataPath(...parts) {
  const dir = findDataDir();
  return dir ? join(dir, ...parts) : null;
}
