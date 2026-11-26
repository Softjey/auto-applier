import { existsSync, realpathSync } from 'node:fs';
import { copyFile, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

import { parseSkillsFile, serializeSkillsFile } from '../src/lib/csv';
import type { SkillRecord } from '../src/lib/types';

const API_PATH = '/api/skills';
const MAX_BODY_BYTES = 5 * 1024 * 1024;

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request too large');
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function normalizeRating(value: unknown): SkillRecord['rating'] {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) return null;
  return value as SkillRecord['rating'];
}

interface PutPayload {
  skills: { name: string; rating: SkillRecord['rating']; seen: boolean; section: string }[];
  revision: string | null;
}

/** Validates the PUT body so a malformed payload never overwrites the CSV. */
function parsePutPayload(raw: string): PutPayload {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null || !Array.isArray((data as { skills?: unknown }).skills)) {
    throw new Error('Expected { skills: [...] }');
  }
  const items = (data as { skills: unknown[] }).skills;
  if (items.length === 0) throw new Error('Empty skill list — write cancelled');

  const revisionRaw = (data as { revision?: unknown }).revision;

  return {
    revision: typeof revisionRaw === 'string' ? revisionRaw : null,
    skills: items.map((item, index) => {
      if (typeof item !== 'object' || item === null) throw new Error(`Invalid record #${index}`);
      const record = item as Partial<SkillRecord>;
      if (typeof record.name !== 'string' || record.name.trim() === '') {
        throw new Error(`Record #${index} has no skill name`);
      }
      return {
        name: record.name.trim(),
        rating: normalizeRating(record.rating),
        seen: record.seen === true,
        section: typeof record.section === 'string' ? record.section.trim() : '',
      };
    }),
  };
}

/**
 * Vite plugin: serves and saves skills.csv via /api/skills.
 * Works in both `vite dev` and `vite preview` — no separate backend needed.
 * The file path can be overridden with the SKILLS_CSV env var (used in tests).
 */
export function skillsApi(): Plugin {
  let csvPath = '';
  let backupDone = false;

  /** File version id — so edits made by hand in an editor are not overwritten. */
  const revisionOf = async (): Promise<string> => {
    const info = await stat(csvPath);
    return `${info.mtimeMs}:${info.size}`;
  };

  const middleware: Middleware = (req, res, next) => {
    if (!(req.url ?? '').split('?')[0]?.endsWith(API_PATH)) {
      next();
      return;
    }

    void (async () => {
      try {
        if (req.method === 'GET') {
          const file = parseSkillsFile(await readFile(csvPath, 'utf8'));
          sendJson(res, 200, { skills: file.skills, revision: await revisionOf(), path: csvPath });
          return;
        }

        if (req.method === 'PUT') {
          const payload = parsePutPayload(await readBody(req));
          const text = await readFile(csvPath, 'utf8');
          const current = parseSkillsFile(text);

          const revision = await revisionOf();
          if (payload.revision !== null && payload.revision !== revision) {
            sendJson(res, 409, {
              error: 'skills.csv was changed outside the app — reload the page',
              revision,
            });
            return;
          }

          // Columns the app does not know are taken from disk so they are not lost.
          const extras = new Map(current.skills.map((s) => [s.name, s.extra]));
          const merged: SkillRecord[] = payload.skills.map((skill) => {
            const extra = extras.get(skill.name);
            return { ...skill, ...(extra !== undefined ? { extra } : {}) };
          });

          const output = serializeSkillsFile({ format: current.format, skills: merged });
          if (output === text) {
            sendJson(res, 200, { ok: true, count: merged.length, revision, unchanged: true });
            return;
          }

          // One backup per process lifetime — insurance against a corrupted write.
          if (!backupDone) {
            await copyFile(csvPath, `${csvPath}.bak`).catch(() => undefined);
            backupDone = true;
          }
          const tmpPath = `${csvPath}.tmp`;
          await writeFile(tmpPath, output, 'utf8');
          await rename(tmpPath, csvPath); // atomic replace

          sendJson(res, 200, { ok: true, count: merged.length, revision: await revisionOf() });
          return;
        }

        res.statusCode = 405;
        res.setHeader('Allow', 'GET, PUT');
        res.end();
      } catch (error) {
        sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) });
      }
    })();
  };

  return {
    name: 'skills-csv-api',
    configResolved(config) {
      const override = process.env['SKILLS_CSV'];
      const configured =
        override !== undefined && override !== ''
          ? path.resolve(config.root, override)
          : path.resolve(config.root, '..', '..', 'data', 'skills.csv');
      csvPath = existsSync(configured) ? realpathSync(configured) : configured;
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
