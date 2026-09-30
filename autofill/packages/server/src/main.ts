import { serve } from '@hono/node-server';
import { createApp } from './app';
import { HOST, PORT, REPO_ROOT } from './config';
import { createLegacyResolver } from './legacy/resolver';
import { CvService } from './services/cv-service';
import { PlanService } from './services/plan-service';

const resolver = createLegacyResolver();
const app = createApp({
  plans: new PlanService(resolver),
  cvs: new CvService(resolver, process.env['AUTOFILL_RESUME_OUT']),
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`autofill server listening on http://${HOST}:${PORT} (repo ${REPO_ROOT})`);
});
