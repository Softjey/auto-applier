import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { PlanRequest, type PlanResponse } from '@applier/protocol';
import { loopbackExtensionOnly } from './guards';
import type { CvService } from './services/cv-service';
import type { PlanService } from './services/plan-service';

export interface AppDeps {
  plans: PlanService;
  cvs: CvService;
}

export function createApp({ plans, cvs }: AppDeps) {
  return new Hono()
    .use(loopbackExtensionOnly)
    .get('/ping', (c) => c.json({ ok: true }))
    .post('/plan', zValidator('json', PlanRequest), async (c) => {
      const { fields } = c.req.valid('json');
      const body: PlanResponse = { plan: await plans.plan(fields) };
      return c.json(body);
    })
    .get('/cvs', async (c) => c.json({ cvs: await cvs.list() }))
    .get('/cv', async (c) => {
      const cv = await cvs.read(c.req.query('id') ?? '');
      return cv ? c.json(cv) : c.json({ error: 'unknown cv' }, 404);
    });
}

export type App = ReturnType<typeof createApp>;
