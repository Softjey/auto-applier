#!/usr/bin/env node
// Sorts vacancy folders (out/<Company>_<id>-<Title> or out/<Company>-<Title>) into
// per-status subfolders, based on a mapping file the agent builds from onetap data.
// Safe by design: dry-run unless --apply, never overwrites, never deletes, never touches
// a folder it can't confidently classify.
//
// Vacancy folders are found recursively: a directory that contains at least one file
// directly inside it is treated as a vacancy leaf (whatever its current nesting — loose in
// --dir, or already sorted under a status subfolder from a previous run); a directory that
// contains only subdirectories is treated as a container and is recursed into. This makes
// re-running after statuses change in onetap safe and correct: an already-sorted folder
// whose status changed gets picked up and moved to its new status folder.

import fs from "node:fs";
import path from "node:path";
import { findAllVacancyFolders } from "./find-vacancy-folders.mjs";

function parseArgs(argv) {
  const args = { dir: "out", apply: false, map: null, report: null };
  for (const arg of argv) {
    if (arg === "--apply") args.apply = true;
    else if (arg.startsWith("--dir=")) args.dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--map=")) args.map = arg.slice("--map=".length);
    else if (arg.startsWith("--report=")) args.report = arg.slice("--report=".length);
    else if (arg === "-h" || arg === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  console.log(`Usage: node organize.mjs --map=<mapping.json> [--dir=out] [--apply] [--report=<unmatched.json>]

Mapping file shape:
{
  "byId":     { "<vacancyId>": "APPLIED", ... },
  "byFolder": { "<exact folder name>": "SAVED", ... }
}

Without --apply, only prints the plan (dry run). Nothing is written or moved.
With --apply, moves folders into --dir/<STATUS>/<folder name>.

Finds vacancy folders recursively (works whether they're loose in --dir or already sorted
under a status subfolder from a previous run), never overwrites an existing destination,
never deletes anything, and skips any folder it cannot confidently match to a status
(reported, left untouched).`);
}

const VACANCY_ID_RE = /_([a-z0-9]{20,30})-/;

function sanitizeStatus(status) {
  return String(status).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  if (!args.map) {
    usage();
    throw new Error("--map=<mapping.json> is required");
  }

  const dir = path.resolve(args.dir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Not a directory: ${dir}`);
  }

  const mapping = JSON.parse(fs.readFileSync(path.resolve(args.map), "utf8"));
  const byId = mapping.byId || {};
  const byFolder = mapping.byFolder || {};

  const found = findAllVacancyFolders(dir);

  const plan = []; // { folder, status, src, dest }
  const alreadyOrganized = [];
  const conflicts = [];
  const unmatched = [];

  for (const { folder, src } of found) {
    let status = byFolder[folder];
    if (!status) {
      const m = folder.match(VACANCY_ID_RE);
      if (m) status = byId[m[1]];
    }

    if (!status) {
      unmatched.push(folder);
      continue;
    }

    const statusDir = sanitizeStatus(status);
    const dest = path.join(dir, statusDir, folder);

    if (dest === src) {
      alreadyOrganized.push(folder);
      continue;
    }

    if (fs.existsSync(dest)) {
      conflicts.push({ folder, status: statusDir, dest });
      continue;
    }

    plan.push({ folder, status: statusDir, src, dest });
  }

  console.log(`Scanned ${found.length} vacancy folder(s) under ${dir}`);
  console.log(`  to move:           ${plan.length}`);
  console.log(`  already organized: ${alreadyOrganized.length}`);
  console.log(`  conflicts (kept):  ${conflicts.length}`);
  console.log(`  unmatched (kept):  ${unmatched.length}`);
  console.log();

  const byStatus = {};
  for (const p of plan) (byStatus[p.status] ??= []).push(p.folder);
  for (const [status, folders] of Object.entries(byStatus)) {
    console.log(`${status} (${folders.length})`);
    for (const f of folders) console.log(`  ${f}`);
  }

  if (conflicts.length) {
    console.log("\nConflicts — destination already exists, left untouched:");
    for (const c of conflicts) console.log(`  ${c.folder} -> ${c.dest}`);
  }

  if (unmatched.length) {
    console.log("\nUnmatched — no status found, left untouched:");
    for (const f of unmatched) console.log(`  ${f}`);
  }

  if (args.report) {
    fs.writeFileSync(
      path.resolve(args.report),
      JSON.stringify({ unmatched, conflicts }, null, 2)
    );
    console.log(`\nWrote unmatched/conflict report to ${args.report}`);
  }

  if (!args.apply) {
    console.log("\nDry run only — nothing moved. Re-run with --apply to perform the moves.");
    return;
  }

  console.log("\nApplying...");
  let moved = 0;
  for (const p of plan) {
    fs.mkdirSync(path.dirname(p.dest), { recursive: true });
    fs.renameSync(p.src, p.dest);
    moved++;
  }
  console.log(`Moved ${moved} folder(s).`);

  // Clean up any status directories left empty by the move (e.g. a status that no longer
  // has any vacancies in it).
  for (const statusDir of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!statusDir.isDirectory()) continue;
    const full = path.join(dir, statusDir.name);
    if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
  }
}

main();
