#!/usr/bin/env node
// Builds mapping.json for organize.mjs by calling the onetap.work API directly —
// no manual MCP round-trips. For folders with a vacancy id in their name, one direct
// lookup per id (GET /vacancies/:id/applications/my) run with bounded concurrency.
// For id-less folders (custom vacancies), a free-text search by company name, picking
// the best title match; anything not confidently resolved is left out, never guessed.

import fs from "node:fs";
import path from "node:path";
import { getMyApplicationForVacancy, listApplications, mapWithConcurrency } from "./onetap-client.mjs";
import { findAllVacancyFolders } from "./find-vacancy-folders.mjs";

function parseArgs(argv) {
  const args = { dir: "out", out: "mapping.json", concurrency: 8 };
  for (const arg of argv) {
    if (arg.startsWith("--dir=")) args.dir = arg.slice("--dir=".length);
    else if (arg.startsWith("--out=")) args.out = arg.slice("--out=".length);
    else if (arg.startsWith("--concurrency=")) args.concurrency = Number(arg.slice("--concurrency=".length));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

const VACANCY_ID_RE = /_([a-z0-9]{20,30})-/;

// "Aristocrat-Frontend-Developer" -> { company: "Aristocrat", titleWords: ["frontend","developer"] }
function splitFolderName(folder) {
  const [company, ...rest] = folder.split("-");
  return { company, titleWords: rest.join("-").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) };
}

function scoreTitleMatch(titleWords, candidateTitle) {
  const candidateWords = new Set(candidateTitle.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  let hits = 0;
  for (const w of titleWords) if (candidateWords.has(w)) hits++;
  return hits / Math.max(titleWords.length, 1);
}

async function resolveByFolder(folder) {
  const { company, titleWords } = splitFolderName(folder);
  const { applications } = (await listApplications({ query: company, limit: 30 })) ?? { applications: [] };
  if (!applications.length) return null;

  let best = null;
  let bestScore = 0;
  for (const app of applications) {
    const score = scoreTitleMatch(titleWords, app.vacancy?.title ?? "");
    if (score > bestScore) {
      bestScore = score;
      best = app;
    }
  }
  // Require a reasonably confident match — otherwise leave it for manual resolution.
  if (!best || bestScore < 0.5) return null;
  return best.status;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.resolve(args.dir);
  const found = findAllVacancyFolders(dir);

  const withId = [];
  const withoutId = [];
  for (const { folder } of found) {
    const m = folder.match(VACANCY_ID_RE);
    if (m) withId.push({ folder, id: m[1] });
    else withoutId.push(folder);
  }

  console.log(`${found.length} folders: ${withId.length} with vacancy id, ${withoutId.length} without.`);

  console.log(`Looking up ${withId.length} vacancy ids (concurrency ${args.concurrency})...`);
  const byId = {};
  const idMisses = [];
  await mapWithConcurrency(withId, args.concurrency, async ({ folder, id }) => {
    const app = await getMyApplicationForVacancy(id);
    if (app?.status) byId[id] = app.status;
    else idMisses.push(folder);
  });
  console.log(`  resolved ${Object.keys(byId).length}/${withId.length}`);

  console.log(`Resolving ${withoutId.length} id-less folders by company/title search...`);
  const byFolder = {};
  const folderMisses = [];
  await mapWithConcurrency(withoutId, args.concurrency, async (folder) => {
    const status = await resolveByFolder(folder);
    if (status) byFolder[folder] = status;
    else folderMisses.push(folder);
  });
  console.log(`  resolved ${Object.keys(byFolder).length}/${withoutId.length}`);

  fs.writeFileSync(path.resolve(args.out), JSON.stringify({ byId, byFolder }, null, 2));
  console.log(`\nWrote ${args.out}`);

  if (idMisses.length) {
    console.log(`\nNo application record found for these (left out, review manually):`);
    for (const f of idMisses) console.log(`  ${f}`);
  }
  if (folderMisses.length) {
    console.log(`\nNo confident company/title match for these (left out, review manually):`);
    for (const f of folderMisses) console.log(`  ${f}`);
  }
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
