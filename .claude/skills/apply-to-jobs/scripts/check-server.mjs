#!/usr/bin/env node
// Is the autofill plan server running? The extension keeps the CV list, the form plans and
// the password manager behind it — with it down there is no CV to pick, no "Save password?"
// after a sign-in, and a small round "!" where the panel should be.
//
//   check-server.mjs [--port=7357]
//
// The server answers only the extension (a plain request gets 403), so ANY HTTP answer means
// it is up; "connection refused" or a timeout means it is down.
// Exit 0: up. Exit 1: down — start it with `pnpm dev:server` in autofill/ and leave it running.

const arg = process.argv.slice(2).find((a) => a.startsWith("--port="));
const port = Number(arg?.slice("--port=".length) || process.env.AUTOFILL_PORT || 7357);
const url = `http://127.0.0.1:${port}/ping`;

try {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  console.log(`autofill server: up on 127.0.0.1:${port} (HTTP ${res.status} to a non-extension caller is expected)`);
} catch {
  console.log(`autofill server: NOT running on 127.0.0.1:${port}`);
  console.log("  start it:  cd autofill && pnpm dev:server   (leave it running)");
  console.log("  without it the extension cannot offer CVs, fill from the profile or save a password.");
  process.exit(1);
}
