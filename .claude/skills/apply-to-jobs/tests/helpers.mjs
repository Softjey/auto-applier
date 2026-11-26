import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SCRIPTS = resolve(HERE, "../scripts");
const FIXTURES = resolve(HERE, "../../../../autofill/fixtures");

export function makeDataDir() {
  const dir = mkdtempSync(join(tmpdir(), "applier-data-"));
  copyFileSync(join(FIXTURES, "profile.test.json"), join(dir, "profile.json"));
  copyFileSync(join(FIXTURES, "apply-config.test.json"), join(dir, "apply-config.json"));
  return {
    dir,
    run: (script, ...args) =>
      spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
        env: { ...process.env, APPLIER_DATA_DIR: dir },
        encoding: "utf8",
      }),
    read: (name) => JSON.parse(readFileSync(join(dir, name), "utf8")),
    write: (name, value) => writeFileSync(join(dir, name), typeof value === "string" ? value : JSON.stringify(value)),
    path: (name) => join(dir, name),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
