import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@applier/protocol';
import { createApp } from '../src/app';
import type { Resolver } from '../src/legacy/resolver';
import { CvService } from '../src/services/cv-service';
import { PlanService } from '../src/services/plan-service';

const EXTENSION = `chrome-extension://${'a'.repeat(32)}`;
const resolver: Resolver = {
  classify: async (f: FieldDescriptor) =>
    f.kind === 'file'
      ? { status: 'runtime', runtime: 'cv' }
      : { status: 'resolved', value: `v:${f.label}`, source: 'test' },
  loadConfig: async () => ({}),
};
const app = createApp({ plans: new PlanService(resolver), cvs: new CvService(resolver) });

const post = (headers: Record<string, string>, body: unknown) =>
  app.request('http://127.0.0.1:7357/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const field = (over: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  id: 'f1',
  label: 'E-mail',
  key: 'email',
  kind: 'email',
  required: true,
  ...over,
});

describe('access guards', () => {
  it('refuses a web page origin', async () => {
    const res = await post({ origin: 'https://evil.example' }, { fields: [field()] });
    expect(res.status).toBe(403);
  });

  it('refuses a request with no origin (no-cors fetch)', async () => {
    expect((await post({}, { fields: [field()] })).status).toBe(403);
  });

  it('refuses a non-loopback Host (DNS rebinding)', async () => {
    const res = await app.request('http://evil.example:7357/ping', { headers: { origin: EXTENSION } });
    expect(res.status).toBe(403);
  });

  it('answers the extension and echoes only its origin', async () => {
    const res = await app.request('http://127.0.0.1:7357/ping', { headers: { origin: EXTENSION } });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(EXTENSION);
  });
});

describe('POST /plan', () => {
  it('returns one entry per field, in order', async () => {
    const res = await post(
      { origin: EXTENSION },
      { fields: [field(), field({ id: 'f2', kind: 'file', label: 'CV', key: 'cv' })] },
    );
    expect(await res.json()).toEqual({
      plan: [
        { id: 'f1', action: 'set', value: 'v:E-mail', source: 'test' },
        { id: 'f2', action: 'upload-cv' },
      ],
    });
  });

  it('rejects a malformed body', async () => {
    const res = await post({ origin: EXTENSION }, { fields: [{ id: '' }] });
    expect(res.status).toBe(400);
  });
});

describe('GET /cv', () => {
  it('404s an id that is not in the listing (no path traversal)', async () => {
    const res = await app.request('http://127.0.0.1:7357/cv?id=../../../etc/passwd', {
      headers: { origin: EXTENSION },
    });
    expect(res.status).toBe(404);
  });
});
