import { serve } from '@hono/node-server';
import { createApp } from './app';
import { HOST, PORT, REPO_ROOT } from './config';
import { createLegacyResolver } from './legacy/resolver';
import { CommandBus } from './services/command-bus';
import { CredsService } from './services/creds-service';
import { CvService } from './services/cv-service';
import { PlanService } from './services/plan-service';
import { SalaryService } from './services/salary-service';

const resolver = createLegacyResolver();
const app = createApp({
  plans: new PlanService(resolver, new SalaryService()),
  cvs: new CvService(resolver, process.env['AUTOFILL_RESUME_OUT']),
  creds: new CredsService(),
  bus: new CommandBus(),
  ...(process.env['AUTOFILL_EXTENSION_ID']
    ? { extensionId: process.env['AUTOFILL_EXTENSION_ID'] }
    : {}),
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`autofill server listening on http://${HOST}:${PORT} (repo ${REPO_ROOT})`);
});
