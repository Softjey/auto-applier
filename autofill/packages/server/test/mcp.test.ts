import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { Resolver } from '../src/legacy/resolver';
import { CommandBus } from '../src/services/command-bus';
import { CredsService } from '../src/services/creds-service';
import { CvService } from '../src/services/cv-service';
import { PlanService } from '../src/services/plan-service';
import { SalaryService } from '../src/services/salary-service';
import { EXTENSION_ID } from '@applier/protocol';

const EXTENSION = `chrome-extension://${EXTENSION_ID}`;
const resolver: Resolver = {
  classify: async () => ({ status: 'resolved', value: 'x', source: 'test' }),
  loadConfig: async () => ({}),
};

function setup() {
  const bus = new CommandBus();
  const app = createApp({
    plans: new PlanService(resolver, new SalaryService()),
    cvs: new CvService(resolver),
    creds: new CredsService(),
    bus,
  });
  const rpc = (body: unknown, headers: Record<string, string> = {}) =>
    app.request('http://127.0.0.1:7357/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const ext = (path: string, body: unknown = {}, origin = EXTENSION) =>
    app.request(`http://127.0.0.1:7357${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify(body),
    });
  return { app, bus, rpc, ext };
}

const call = (name: string, args: unknown = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name, arguments: args },
});

describe('/mcp access', () => {
  it('refuses a web page (Origin present)', async () => {
    const { rpc } = setup();
    const res = await rpc(
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
  });

  it('refuses a non-JSON content type (a no-preflight page request)', async () => {
    const { app } = setup();
    const res = await app.request('http://127.0.0.1:7357/mcp', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    expect(res.status).toBe(415);
  });

  it('refuses a rebinding Host', async () => {
    const { app } = setup();
    const res = await app.request('http://evil.example:7357/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(403);
  });

  it('keeps the extension routes extension-only, and the password-grade ones pinned', async () => {
    const { app, ext } = setup();
    const noOrigin = await app.request('http://127.0.0.1:7357/ext/next', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(noOrigin.status).toBe(403);
    const other = await ext(
      '/ext/result',
      { id: 'x', ok: true, data: 1 },
      `chrome-extension://${'a'.repeat(32)}`,
    );
    expect(other.status).toBe(403);
  });
});

describe('/mcp protocol', () => {
  it('initializes, lists the tools with JSON schemas, answers notifications with 202', async () => {
    const { rpc } = setup();
    const init = await (
      await rpc({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      })
    ).json();
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.capabilities).toEqual({ tools: {} });
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    const list = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
    const names = list.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([
      'autofill_status',
      'autofill_open_and_fill',
      'autofill_fill',
      'autofill_read_form',
      'autofill_submit',
      'autofill_close_tab',
    ]);
    const submit = list.result.tools.find((t: { name: string }) => t.name === 'autofill_submit');
    expect(submit.inputSchema.required).toContain('token');
  });
});

describe('agent -> extension round trip', () => {
  it('hands a tool call to the extension poll and returns its result', async () => {
    const { rpc, ext, bus } = setup();
    expect(bus.connected).toBe(false);
    const polled = ext('/ext/next');
    const pendingCall = rpc(
      call('autofill_open_and_fill', { url: 'https://justjoin.it/job-offer/acme', cv: '123' }),
    );
    const { command } = await (await polled).json();
    expect(bus.connected).toBe(true);
    expect(command.command).toEqual({
      op: 'open-and-fill',
      url: 'https://justjoin.it/job-offer/acme',
      cv: '123',
    });
    await ext('/ext/result', { id: command.id, ok: true, data: { filled: 3 } });
    const out = await (await pendingCall).json();
    expect(out.result.isError).toBeUndefined();
    expect(JSON.parse(out.result.content[0].text)).toEqual({ filled: 3 });
  });

  it('queues a command until the extension polls, and relays its error as a tool error', async () => {
    const { rpc, ext } = setup();
    const pendingCall = rpc(call('autofill_fill', { tab: 7 }));
    await new Promise((r) => setTimeout(r, 10));
    const { command } = await (await ext('/ext/next')).json();
    expect(command.command).toEqual({ op: 'fill', tab: 7 });
    await ext('/ext/result', { id: command.id, ok: false, error: 'no form here' });
    const out = await (await pendingCall).json();
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toBe('no form here');
  });

  it('rejects a tool call that names no tab, and a submit without its token', async () => {
    const { rpc } = setup();
    const noTab = await (await rpc(call('autofill_fill', {}))).json();
    expect(noTab.result.isError).toBe(true);
    const noToken = await (await rpc(call('autofill_submit', { tab: 1 }))).json();
    expect(noToken.result.isError).toBe(true);
    expect(noToken.result.content[0].text).toMatch(/token/);
  });

  it('autofill_status reports whether an extension is polling', async () => {
    const { rpc } = setup();
    const out = await (await rpc(call('autofill_status'))).json();
    expect(JSON.parse(out.result.content[0].text)).toEqual({ extensionConnected: false });
  });
});

describe('CommandBus', () => {
  it('fails a command nobody picks up with the right reason', async () => {
    const bus = new CommandBus();
    await expect(bus.dispatch({ op: 'close-tab', tab: 1 }, 20)).rejects.toThrow(/not connected/);
  });
});
