// Minimal client for the onetap.work API (see github.com/Softjey/vacancies_tracker,
// apps/backend/src/modules/application). Auth is a session cookie, never a bearer token —
// read from ONETAP_SESSION_ID (env var, or .env.local next to this file). The cookie value
// is never logged or included in any error message.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = "https://api.onetap.work";

function loadSessionId() {
  if (process.env.ONETAP_SESSION_ID) return process.env.ONETAP_SESSION_ID;
  const envFile = path.join(HERE, ".env.local");
  if (fs.existsSync(envFile)) {
    const line = fs
      .readFileSync(envFile, "utf8")
      .split("\n")
      .find((l) => l.startsWith("ONETAP_SESSION_ID="));
    if (line) return line.slice("ONETAP_SESSION_ID=".length).trim();
  }
  throw new Error(
    "No onetap session found. Set ONETAP_SESSION_ID env var, or create " +
      ".claude/skills/organize-by-status/.env.local with ONETAP_SESSION_ID=<value> " +
      "(gitignored — never commit it)."
  );
}

const SESSION_ID = loadSessionId();

async function request(pathname, searchParams) {
  const url = new URL(pathname, BASE_URL);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url, {
    headers: { Cookie: `sessionId=${SESSION_ID}`, Accept: "application/json" },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `onetap auth failed (HTTP ${res.status}) on ${pathname} — the session cookie is likely expired. Get a fresh sessionId and update .env.local.`
    );
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`onetap request failed: HTTP ${res.status} on ${pathname}`);
  }
  return res.json();
}

/** GET /vacancies/:vacancyId/applications/my — the caller's application for one vacancy, or null. */
export async function getMyApplicationForVacancy(vacancyId) {
  return request(`/vacancies/${vacancyId}/applications/my`);
}

/** GET /applications — paginated list, optionally filtered by free-text query. */
export async function listApplications({ page = 1, limit = 50, query, status, activityStatus } = {}) {
  return request("/applications", { page, limit, query, status, activityStatus });
}

/** Bounded-concurrency map, so we don't fire 250 requests at once. */
export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
