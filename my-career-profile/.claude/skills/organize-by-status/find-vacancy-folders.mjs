import fs from "node:fs";
import path from "node:path";

const MAX_DEPTH = 4;

// A vacancy folder is a leaf: it has files directly inside it (the CV). A status container
// (out/APPLIED, or nothing yet) has only subdirectories and gets recursed into. This makes
// discovery work the same whether folders are loose in --dir or already sorted from a
// previous run — re-running after statuses change just picks up what moved.
export function findVacancyFolders(dir, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const subdirs = entries.filter((e) => e.isDirectory());
  const hasFiles = entries.some((e) => e.isFile());

  if (hasFiles || subdirs.length === 0) {
    return [{ folder: path.basename(dir), src: dir }];
  }

  return subdirs.flatMap((e) => findVacancyFolders(path.join(dir, e.name), depth + 1));
}

export function findAllVacancyFolders(rootDir) {
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => findVacancyFolders(path.join(rootDir, e.name)));
}
