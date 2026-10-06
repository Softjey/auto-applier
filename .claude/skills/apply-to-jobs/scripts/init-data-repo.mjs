#!/usr/bin/env node
// Creates the user's private data repo from templates/data-repo and points this
// code repo at it. Deterministic on purpose: the setup-data-repo skill calls it
// and then drives the interview; nothing here asks a question.
//
//   init-data-repo.mjs [--dir=<path>] [--resume-repo=<path>] [--resume-file=<pdf>] [--no-git]
//
//   --dir          where the data repo goes (default: ../auto-applier-data next to this repo)
//   --resume-repo  the resume-rendering repo; fills apply-config.json's paths
//   --resume-file  ONE finished resume PDF sent with every application (no tailoring);
//                  fills paths.baseResume. Use it when there is no resume repo.
//   --no-git       copy the files but do not `git init`
//   --no-pointer   do not write <repo>/.data-dir (tests)
//
// Refuses to touch a directory that already has a profile.json. Writes
// <repo>/.data-dir (git-ignored) only when --dir is not the default location.

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { REPO_ROOT, DATA_DIR_POINTER, DEFAULT_DATA_DIR } from "./lib/data-dir.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);
const fail = (msg) => {
  console.error(`init-data-repo: ${msg}`);
  process.exit(1);
};

const target = resolve(flag("dir") || DEFAULT_DATA_DIR);
const templates = join(REPO_ROOT, "templates", "data-repo");

if (target === REPO_ROOT || target.startsWith(REPO_ROOT + "/"))
  fail("the data repo must live outside the code repo — it is the private half.");
if (existsSync(join(target, "profile.json"))) fail(`${target} already has a profile.json; not overwriting.`);
if (!existsSync(templates)) fail(`templates missing at ${templates}`);

const resumeFile = flag("resume-file");
if (resumeFile && (!existsSync(resolve(resumeFile)) || !/\.pdf$/i.test(resumeFile)))
  fail(`--resume-file must be an existing .pdf: ${resolve(resumeFile)}`);

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    const dst = join(to, name);
    if (statSync(src).isDirectory()) copyTree(src, dst);
    else if (name.endsWith(".md")) writeFileSync(dst, readFileSync(src, "utf8").replaceAll("{{CODE_REPO}}", REPO_ROOT));
    else copyFileSync(src, dst);
  }
}
copyTree(templates, target);

const resumeRepo = flag("resume-repo");
if (resumeRepo) {
  const root = resolve(resumeRepo);
  const cfgPath = join(target, "apply-config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.paths = {
    ...cfg.paths,
    resumeRepo: root,
  };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
}

if (resumeFile) {
  const file = resolve(resumeFile);
  const cfgPath = join(target, "apply-config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.paths = { ...cfg.paths, baseResume: file };
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
}

if (!has("no-git") && !existsSync(join(target, ".git"))) {
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: target });
  execFileSync("git", ["add", "-A"], { cwd: target });
  execFileSync("git", ["commit", "-q", "-m", "chore: initialise auto-applier data repo"], { cwd: target });
}

if (target !== DEFAULT_DATA_DIR && !has("no-pointer")) writeFileSync(DATA_DIR_POINTER, target + "\n");

console.log(`Data repo ready at ${target}`);
console.log(target === DEFAULT_DATA_DIR ? "(default location — no pointer needed)" : `Pointer written to ${DATA_DIR_POINTER}`);
console.log("Next: run the profile-interview skill to fill profile.json, then import-stories for your STAR stories. Never add a public remote to this repo.");
