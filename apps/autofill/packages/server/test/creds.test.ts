import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENSION_ID } from '@applier/protocol';
import { createApp } from '../src/app';
import type { Resolver } from '../src/legacy/resolver';
import { CredsService } from '../src/services/creds-service';
import { CvService } from '../src/services/cv-service';
import { PlanService } from '../src/services/plan-service';
import { SalaryService } from '../src/services/salary-service';

/** The union of every field the credential routes answer with. */
interface Body {
  matches: { id: string; login: string; level: string; verified: boolean }[];
  result: string;
  state: string;
  id: string;
  login: string;
  password: string;
}

const OURS = `chrome-extension://${EXTENSION_ID}`;
const STRANGER = `chrome-extension://${'b'.repeat(32)}`;
const resolver: Resolver = {
  classify: async () => ({ status: 'unknown' }),
  loadConfig: async () => ({}),
};

function setup(seed?: unknown) {
  const file = join(mkdtempSync(join(tmpdir(), 'applier-creds-')), 'credentials.json');
  if (seed) writeFileSync(file, JSON.stringify(seed));
  const app = createApp({
    plans: new PlanService(resolver, new SalaryService()),
    cvs: new CvService(resolver),
    creds: new CredsService(
      async () => file,
      async () => 'me@example.invalid',
    ),
  });
  const call = async (path: string, body: unknown, origin = OURS) => {
    const res = await app.request(`http://127.0.0.1:7357${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json()) as Body };
  };
  return { call, file, stored: () => JSON.parse(readFileSync(file, 'utf8')) };
}

const legacy = {
  $schemaVersion: 1,
  entries: [
    {
      domain: 'acme.wd3.myworkdayjobs.com',
      company: 'Acme',
      login: 'me@example.invalid',
      password: 'Pw-acme-1',
      createdAt: '2026-09-01',
    },
  ],
};

describe('credential routes: who may ask', () => {
  it("refuses another extension's origin — only the pinned id reads passwords", async () => {
    const { call } = setup(legacy);
    const res = await call(
      '/creds/match',
      { origin: 'https://acme.wd3.myworkdayjobs.com' },
      STRANGER,
    );
    expect(res.status).toBe(403);
  });

  it('refuses a web page origin', async () => {
    const { call } = setup(legacy);
    expect(
      (await call('/creds/match', { origin: 'https://x.test' }, 'https://evil.example')).status,
    ).toBe(403);
  });
});

describe('matching a login to a page', () => {
  it('offers a schema-1 entry on its exact host, without its password', async () => {
    const { call } = setup(legacy);
    const { json } = await call('/creds/match', {
      origin: 'https://acme.wd3.myworkdayjobs.com/en/x',
    });
    expect(json.matches).toHaveLength(1);
    expect(json.matches[0]).toMatchObject({
      login: 'me@example.invalid',
      level: 'exact',
      verified: true,
    });
    expect(JSON.stringify(json)).not.toContain('Pw-acme-1');
  });

  it('never offers one Workday tenant the password of another', async () => {
    const { call } = setup(legacy);
    const { json } = await call('/creds/match', { origin: 'https://beta.wd3.myworkdayjobs.com/' });
    expect(json.matches).toEqual([]);
  });

  it('offers a sibling subdomain of a single-tenant site as "related", never a lookalike', async () => {
    const { call } = setup({
      entries: [
        { domain: 'accounts.example.com', login: 'a@b.c', password: 'p', createdAt: '2026-01-01' },
      ],
    });
    const sibling = await call('/creds/match', { origin: 'https://careers.example.com/' });
    expect(sibling.json.matches[0]?.level).toBe('related');
    const lookalike = await call('/creds/match', { origin: 'https://evil-example.com/' });
    expect(lookalike.json.matches).toEqual([]);
  });

  it('offers nothing on an http page (only loopback is exempt)', async () => {
    const { call } = setup(legacy);
    const { json } = await call('/creds/match', { origin: 'http://acme.wd3.myworkdayjobs.com/' });
    expect(json.matches).toEqual([]);
  });
});

describe('reveal', () => {
  it('returns the password only for the origin the entry belongs to', async () => {
    const { call } = setup(legacy);
    const id = (await call('/creds/match', { origin: 'https://acme.wd3.myworkdayjobs.com/' })).json[
      'matches'
    ][0].id;
    expect(
      (await call('/creds/reveal', { origin: 'https://acme.wd3.myworkdayjobs.com/', id })).json,
    ).toEqual({
      login: 'me@example.invalid',
      password: 'Pw-acme-1',
    });
    expect((await call('/creds/reveal', { origin: 'https://evil.example/', id })).status).toBe(404);
  });
});

describe('saving a login after a successful sign-in', () => {
  it('creates, then recognises an unchanged password, then updates a changed one', async () => {
    const { call, stored } = setup();
    const body = { origin: 'https://jobs.example.com/login', login: 'me@x.test', password: 'one' };
    const first = await call('/creds/save', body);
    expect(first.json.result).toBe('created');
    expect((await call('/creds/save', body)).json.result).toBe('unchanged');
    expect((await call('/creds/save', { ...body, password: 'two' })).json.result).toBe('updated');
    expect(stored().entries).toHaveLength(1);
    expect(stored().entries[0]).toMatchObject({
      domain: 'jobs.example.com',
      password: 'two',
      verified: true,
    });
  });
});

describe('creating an account', () => {
  it('generates a password, stores it unverified at once, and reuses it on a retry', async () => {
    const { call, stored } = setup();
    const origin = 'https://jobs.example.com/register';
    const a = await call('/creds/draft', { origin });
    expect(a.status).toBe(200);
    expect(a.json.login).toBe('me@example.invalid');
    expect(a.json.password).toHaveLength(20);
    expect(stored().entries[0]).toMatchObject({ verified: false, createdBy: 'extension' });
    // a failed submit and a second click must not mint a second, lost, password
    expect((await call('/creds/draft', { origin })).json.password).toBe(a.json.password);
    const b = await call('/creds/draft', {
      origin,
      regenerate: true,
      alphanumeric: true,
      length: 16,
    });
    expect(b.json.password).toMatch(/^[A-Za-z0-9]{16}$/);
    expect(stored().entries).toHaveLength(1);
  });

  it("never replaces a verified account's password, even when asked to regenerate", async () => {
    const { call } = setup(legacy);
    const res = await call('/creds/draft', {
      origin: 'https://acme.wd3.myworkdayjobs.com/',
      regenerate: true,
    });
    expect(res.json.password).toBe('Pw-acme-1');
  });

  it('marks the account verified once a sign-in works, and forgets it on request', async () => {
    const { call, stored } = setup();
    const origin = 'https://jobs.example.com/';
    const { json } = await call('/creds/draft', { origin });
    expect((await call('/creds/verified', { origin, id: json.id })).status).toBe(200);
    expect(stored().entries[0].verified).toBe(true);
    expect(
      (await call('/creds/delete', { origin: 'https://evil.example/', id: json.id })).status,
    ).toBe(404);
    expect((await call('/creds/delete', { origin, id: json.id })).status).toBe(200);
    expect(stored().entries).toEqual([]);
  });

  it('refuses to create an account on an insecure page', async () => {
    const { call } = setup();
    expect((await call('/creds/draft', { origin: 'http://jobs.example.com/' })).status).toBe(422);
  });
});

describe('old hand-kept records', () => {
  const unused = {
    domain: 'apply.deloitte.test',
    login: 'me@example.invalid',
    password: 'never-submitted',
    createdAt: '2026-09-06',
    status: 'UNUSED — the user already had an account; this password opens nothing.',
  };

  it('an UNUSED record is kept but never offered, revealed or treated as an account', async () => {
    const { call } = setup({ entries: [unused] });
    const match = await call('/creds/match', { origin: 'https://apply.deloitte.test/' });
    expect(match.json.matches).toEqual([]);
    const id = (await call('/creds/draft', { origin: 'https://other.example.test/' })).json.id;
    expect(
      (await call('/creds/reveal', { origin: 'https://apply.deloitte.test/', id })).status,
    ).toBe(404);
  });

  it('a real sign-in on that host replaces the dead record and clears its status', async () => {
    const { call, stored } = setup({ entries: [unused] });
    const res = await call('/creds/save', {
      origin: 'https://apply.deloitte.test/login',
      login: 'me@example.invalid',
      password: 'the-real-one',
    });
    expect(res.json.result).toBe('updated');
    expect(stored().entries[0]).toMatchObject({ password: 'the-real-one', verified: true });
    expect(stored().entries[0]).not.toHaveProperty('status');
  });

  it('rewriting the file keeps fields this code does not know about', async () => {
    const { call, stored } = setup({
      entries: [
        {
          ...unused,
          status: undefined,
          domain: 'a.example.test',
          note: 'Avature, step 2 of 3',
          extra: 42,
        },
      ],
    });
    await call('/creds/draft', { origin: 'https://b.example.test/' });
    const kept = stored().entries.find((e: { domain: string }) => e.domain === 'a.example.test');
    expect(kept).toMatchObject({ note: 'Avature, step 2 of 3', extra: 42 });
  });
});
