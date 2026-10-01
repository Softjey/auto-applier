import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import {
  CredsCheckRequest,
  CredsDraftRequest,
  CredsIdRequest,
  CredsSaveRequest,
  CvRequest,
  EXTENSION_ID,
  PlanRequest,
  type PlanResponse,
} from '@applier/protocol';
import { z } from 'zod';
import { loopbackExtensionOnly, pinnedExtensionOnly } from './guards';
import { buildTime } from './services/build-service';
import type { CredsService } from './services/creds-service';
import type { CvService } from './services/cv-service';
import type { PlanService } from './services/plan-service';

export interface AppDeps {
  plans: PlanService;
  cvs: CvService;
  creds: CredsService;
  /** The one extension allowed to read passwords. */
  extensionId?: string;
}

/**
 * Every credential route carries the page's ORIGIN, supplied by the extension's service
 * worker from the browser's own `sender.url` — never by page script. A password is only
 * ever returned for an entry that fits it (see lib/credentials-store.mjs).
 */
const WithOrigin = z.object({ origin: z.url() });

export function createApp({ plans, cvs, creds, extensionId = EXTENSION_ID }: AppDeps) {
  return new Hono()
    .use(loopbackExtensionOnly)
    .use('/creds/*', pinnedExtensionOnly(extensionId))
    .get('/ping', (c) => c.json({ ok: true }))
    .post('/build', async (c) => c.json({ builtAt: await buildTime() }))
    .post('/plan', zValidator('json', PlanRequest), async (c) => {
      const { fields, band } = c.req.valid('json');
      const body: PlanResponse = { plan: await plans.plan(fields, band) };
      return c.json(body);
    })
    .post('/cvs', async (c) => c.json({ cvs: await cvs.list() }))
    .post('/cv', zValidator('json', CvRequest), async (c) => {
      const cv = await cvs.read(c.req.valid('json').id);
      return cv ? c.json(cv) : c.json({ error: 'unknown cv' }, 404);
    })
    .post('/creds/match', zValidator('json', WithOrigin), async (c) =>
      c.json({ matches: await creds.match(c.req.valid('json').origin) }),
    )
    .post(
      '/creds/reveal',
      zValidator('json', WithOrigin.extend(CredsIdRequest.shape)),
      async (c) => {
        const { origin, id } = c.req.valid('json');
        const hit = await creds.reveal(origin, id);
        return hit ? c.json(hit) : c.json({ error: 'no such login for this site' }, 404);
      },
    )
    .post(
      '/creds/save',
      zValidator('json', WithOrigin.extend(CredsSaveRequest.shape)),
      async (c) => {
        const { origin, ...save } = c.req.valid('json');
        return c.json(await creds.save(origin, save));
      },
    )
    .post(
      '/creds/draft',
      zValidator('json', WithOrigin.extend(CredsDraftRequest.shape)),
      async (c) => {
        const { origin, ...draft } = c.req.valid('json');
        try {
          return c.json(await creds.draft(origin, draft));
        } catch (e) {
          return c.json({ error: e instanceof Error ? e.message : String(e) }, 422);
        }
      },
    )
    .post(
      '/creds/check',
      zValidator('json', WithOrigin.extend(CredsCheckRequest.shape)),
      async (c) => {
        const { origin, ...check } = c.req.valid('json');
        return c.json(await creds.check(origin, check));
      },
    )
    .post(
      '/creds/verified',
      zValidator('json', WithOrigin.extend(CredsIdRequest.shape)),
      async (c) => {
        const { origin, id } = c.req.valid('json');
        return (await creds.verify(origin, id))
          ? c.json({ ok: true })
          : c.json({ error: 'no such login for this site' }, 404);
      },
    )
    .post(
      '/creds/delete',
      zValidator('json', WithOrigin.extend(CredsIdRequest.shape)),
      async (c) => {
        const { origin, id } = c.req.valid('json');
        return (await creds.remove(origin, id))
          ? c.json({ ok: true })
          : c.json({ error: 'no such login for this site' }, 404);
      },
    );
}

export type App = ReturnType<typeof createApp>;
