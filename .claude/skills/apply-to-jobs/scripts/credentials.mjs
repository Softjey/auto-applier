#!/usr/bin/env node
// The portal-account store, from the command line. The same file and the same rules
// as the autofill extension's password manager (lib/credentials-store.mjs): the
// extension fills and saves logins in the browser; this is for looking, adding and
// removing them from the terminal, and for the agent to ask "is there an account?"
// without ever seeing a password.
//
// Usage
//   node credentials.mjs status --domain=<host> [--domain=<host> ...]
//        secret-free: does an account exist, and was it ever confirmed by a sign-in?
//        exit 0 = every host has a verified account, 1 = some only unverified/missing, 2 = none known
//   node credentials.mjs list [--secrets]        # passwords are masked unless asked for
//   node credentials.mjs get --domain=<host>     # "Company: login - password"
//   node credentials.mjs add --domain=<host> --company="<Name>" [--login=<email>]
//                            [--url=<signup url>] [--note="..."] [--length=20]
//        generates a password, stores it unverified and prints it. The extension does this
//        itself on a sign-up form ("Create account"); this is the manual fallback.
//   node credentials.mjs verify --domain=<host> [--login=<email>]   # a sign-in worked
//   node credentials.mjs remove --domain=<host> [--login=<email>]
//
// The store is credentials.json in the data repo. It holds real credentials for real
// accounts: same no-public-remote rule as profile.json, stories.json.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dataPath } from "./lib/data-dir.mjs";
import { profilePath } from "./lib/qa-match.mjs";
import {
  draftAccount,
  entryId,
  generatePassword,
  isDead,
  loadStore,
  matchLevel,
  normalizeHost,
  saveStore,
} from "./lib/credentials-store.mjs";

export { generatePassword }; // importers of the old location keep working

const store = () => dataPath("credentials.json");

// The login for a new portal account defaults to the profile's own e-mail.
function defaultLogin() {
  try {
    return JSON.parse(readFileSync(profilePath(), "utf8")).personal?.email || null;
  } catch {
    return null;
  }
}

// Only run the CLI when invoked directly — an import must not print a usage banner or touch the store.
const RUN_AS_CLI = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => {
  const hits = args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
  return hits.length ? hits : null;
};
const one = (name) => (flag(name) || [null])[0];
const has = (name) => args.includes(`--${name}`);
const mask = (p) => p.slice(0, 2) + "…".repeat(6) + p.slice(-2);
const forHost = (entries, host, login, { dead = false } = {}) =>
  entries.filter((e) => (dead || !isDead(e)) && matchLevel(e.domain, host) && (!login || e.login === login));

if (!RUN_AS_CLI) {
  // imported as a module: expose generatePassword and do nothing else
} else if (cmd === "status") {
  const domains = flag("domain") || [];
  if (!domains.length) {
    console.error("need --domain");
    process.exit(2);
  }
  const { entries } = loadStore(store());
  let missing = 0;
  let unverified = 0;
  for (const d of domains) {
    const hits = forHost(entries, d);
    if (!hits.length) {
      console.log(`${d}: no account`);
      missing++;
    } else if (hits.some((e) => e.verified)) {
      const e = hits.find((x) => x.verified);
      console.log(`${d}: account (${e.login})`);
    } else {
      console.log(`${d}: account created, not yet confirmed by a sign-in (${hits[0].login})`);
      unverified++;
    }
  }
  process.exit(missing === domains.length ? 2 : missing + unverified ? 1 : 0);
} else if (cmd === "add") {
  const domain = one("domain");
  const company = one("company");
  const login = one("login") || defaultLogin();
  if (!domain || !company || !login) {
    console.error("need --domain, --company and a login (--login, or personal.email in profile.json)");
    process.exit(2);
  }
  const file = store();
  const existing = loadStore(file).entries.find((e) => e.id === entryId(domain, login));
  if (existing && !has("force")) {
    console.error(`${domain} already has an entry for ${login}. Pass --force to replace its password.`);
    process.exit(3);
  }
  const url = one("url") || `https://${normalizeHost(domain)}/`;
  const made = draftAccount(file, {
    origin: url,
    login,
    length: Number(one("length")) || 20,
    regenerate: true,
    company,
  });
  console.log(`${company}: ${made.login} - ${made.password}`);
} else if (cmd === "verify") {
  const domain = one("domain");
  const file = store();
  const data = loadStore(file);
  const hits = forHost(data.entries, domain || "", one("login"));
  if (!domain || !hits.length) {
    console.error(`no entry for ${domain}`);
    process.exit(1);
  }
  for (const e of hits) e.verified = true;
  saveStore(file, data);
  console.log(`${domain}: verified`);
} else if (cmd === "remove") {
  const domain = one("domain");
  const file = store();
  const data = loadStore(file);
  const hits = forHost(data.entries, domain || "", one("login"), { dead: true });
  if (!domain || !hits.length) {
    console.error(`no entry for ${domain}`);
    process.exit(1);
  }
  data.entries = data.entries.filter((e) => !hits.includes(e));
  saveStore(file, data);
  console.log(`removed ${hits.length} entr${hits.length === 1 ? "y" : "ies"} for ${domain}`);
} else if (cmd === "get") {
  const domain = one("domain");
  const hit = forHost(loadStore(store()).entries, domain || "", one("login"))[0];
  if (!hit) {
    console.error(`no entry for ${domain}`);
    process.exit(1);
  }
  console.log(`${hit.company ?? hit.domain}: ${hit.login} - ${hit.password}`);
} else if (cmd === "list") {
  const entries = loadStore(store()).entries;
  if (!entries.length) console.log("(empty)");
  for (const e of entries) {
    console.log(
      `${e.domain.padEnd(38)} ${(e.company ?? "").padEnd(14)} ${e.login.padEnd(30)} ` +
        `${has("secrets") ? e.password : mask(e.password)}  ${isDead(e) ? "UNUSED" : e.verified ? "verified" : "UNVERIFIED"}  ${e.createdAt}`,
    );
  }
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 23).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
}
