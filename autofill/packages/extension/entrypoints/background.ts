import {
  BackgroundRequest,
  CvListResponse,
  CvResponse,
  PlanResponse,
  SERVER_ORIGIN,
  type BackgroundResult,
} from '@applier/protocol';
import type { ZodType } from 'zod';

async function call<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_ORIGIN}${path}`, init);
  } catch {
    throw new Error('Plan server is not running. Start it: pnpm --dir autofill dev:server');
  }
  if (!res.ok) throw new Error(`Plan server answered ${res.status}`);
  return schema.parse(await res.json());
}

async function handle(raw: unknown): Promise<unknown> {
  const message = BackgroundRequest.parse(raw);
  switch (message.type) {
    case 'plan':
      return call('/plan', PlanResponse, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: message.fields }),
      });
    case 'cvs':
      return call('/cvs', CvListResponse);
    case 'cv':
      return call(`/cv?id=${encodeURIComponent(message.id)}`, CvResponse);
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((raw: unknown) =>
    handle(raw).then(
      (data): BackgroundResult<unknown> => ({ ok: true, data }),
      (e: unknown): BackgroundResult<unknown> => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
    ),
  );
});
