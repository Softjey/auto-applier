#!/usr/bin/env node
// init-data-repo.mjs [--dir=<path>] [--resume-repo=<path>] [--resume-file=<pdf>] [--no-git] [--no-link]
//
//   (default)      creates the data repo as data/ at the root of this repo (git-ignored)
//   --dir          creates it there instead, links data/ to it and allows the folder in
//                  .claude/settings.local.json → permissions.additionalDirectories
//   --resume-repo  the resume-rendering repo; fills apply-config.json's paths
//   --resume-file  ONE finished resume PDF sent with every application; fills paths.baseResume
//   --no-git       copy the files but do not `git init`
//   --no-link      with --dir: neither link data/ nor touch settings (tests)

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, symlinkSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { REPO_ROOT, DEFAULT_DATA_DIR } from "./lib/data-dir.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const has = (name) => args.includes(`--${name}`);
const fail = (msg) => {
  console.error(`init-data-repo: ${msg}`);
  process.exit(1);
};

const target = resolve(flag("dir") || DEFAULT_DATA_DIR);
const templates = join(REPO_ROOT, "templates", "data-repo");

const elsewhere = target !== DEFAULT_DATA_DIR;
const lexists = (p) => { try { lstatSync(p); return true; } catch { return false; } };
if (elsewhere && (target === REPO_ROOT || target.startsWith(REPO_ROOT + "/")))
  fail("inside the code repo only data/ is allowed; pass no --dir, or a folder outside the repo.");
if (elsewhere && !has("no-link") && lexists(DEFAULT_DATA_DIR) && (!existsSync(target) || realpathSync(DEFAULT_DATA_DIR) !== realpathSync(target)))
  fail(`${DEFAULT_DATA_DIR} already exists and points elsewhere; not replacing it.`);
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

const settingsPath = join(REPO_ROOT, ".claude", "settings.local.json");
if (elsewhere && !has("no-link")) {
  if (!lexists(DEFAULT_DATA_DIR)) symlinkSync(target, DEFAULT_DATA_DIR);
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  settings.permissions ??= {};
  settings.permissions.additionalDirectories ??= [];
  if (!settings.permissions.additionalDirectories.includes(target)) settings.permissions.additionalDirectories.push(target);
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

console.log(`Data repo ready at ${target}`);
if (elsewhere && !has("no-link")) console.log(`data/ links to it; the folder is allowed in ${settingsPath}`);
console.log("Next: run the profile-interview skill to fill profile.json, then import-stories for your STAR stories. Never add a public remote to this repo.");
