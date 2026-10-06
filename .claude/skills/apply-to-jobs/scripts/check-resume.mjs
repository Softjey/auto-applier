#!/usr/bin/env node
// Reports which resume mode apply-config.json puts the user in and whether it
// actually works, so setup (and a doubtful user) can see it without a run.
//
//   check-resume.mjs
//
// Exit 0: usable (tailored with PDFs, tailored without any yet, or a base PDF).
// Exit 1: nothing usable is configured / a configured path is missing.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { requireDataDir } from "./lib/data-dir.mjs";

const cfgPath = join(requireDataDir(), "apply-config.json");
const cfg = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, "utf8")) : {};
const { resumeRepo, baseResume } = cfg.paths ?? {};
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const isPdf = (p) => existsSync(p) && statSync(p).isFile() && /\.pdf$/i.test(p);
const say = (msg) => console.log(msg);
let ok = true;

if (resumeRepo) {
  if (!isDir(resumeRepo)) {
    say(`resumeRepo: ${resumeRepo} does not exist`);
    ok = false;
  } else {
    const saved = join(resumeRepo, "out", "SAVED");
    const pdfs = (isDir(saved) ? readdirSync(saved) : []).filter((d) =>
      readdirSync(join(saved, d)).some((f) => /\.pdf$/i.test(f)),
    );
    say(`mode: tailored — ${resumeRepo}`);
    say(
      pdfs.length
        ? `  ${pdfs.length} finished PDF(s) in out/SAVED/ (e.g. ${pdfs[0]})`
        : "  no PDFs in out/SAVED/<Company>_<vacancyId>-<Title>/ yet — build one for a SAVED vacancy",
    );
    if (!pdfs.length && !baseResume) say("  (add paths.baseResume as a fallback if you want one)");
  }
}
if (baseResume) {
  if (isPdf(baseResume)) say(`${resumeRepo ? "fallback" : "mode"}: base resume — ${baseResume}`);
  else {
    say(`baseResume: ${baseResume} is not an existing .pdf`);
    ok = false;
  }
}
if (!resumeRepo && !baseResume) {
  say("no resume configured: set paths.resumeRepo or paths.baseResume in apply-config.json");
  ok = false;
}
if (!cfg.resumeFileName) say("note: resumeFileName is not set — uploads will be named CV.pdf");
process.exit(ok ? 0 : 1);
