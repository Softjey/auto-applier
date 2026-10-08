import type { PageCommand } from '@applier/protocol';
import {
  BackgroundRequest,
  BuildResponse,
  ExtNextResponse,
  type Command,
  type CommandEnvelope,
  type FillSummary,
  CredsCheckResponse,
  CredsDraftResponse,
  CredsMatchResponse,
  CredsRevealResponse,
  CredsSaveResponse,
  CvListResponse,
  CvResponse,
  OkResponse,
  PlanResponse,
  SERVER_ORIGIN,
  type BackgroundResult,
  type PendingOutcome,
  type PendingView,
  type SubmitResult,
} from '@applier/protocol';
import type { ZodType } from 'zod';
import { solveCaptcha } from '../src/captcha/solve';
import { loadSettings } from '../src/passwords/settings';

async function call<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER_ORIGIN}${path}`, init);
  } catch {
    throw new Error('Plan server is not running. Start it: pnpm --dir autofill dev:server');
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Plan server answered ${res.status}`);
  }
  return schema.parse(await res.json());
}

/** Every route is a POST — see server/src/guards.ts for why. */
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * The origin a credential request is for comes from the browser's own `sender`, never from the
 * message: a script on the page cannot ask for another site's login by naming it.
 */
function senderOrigin(sender: { url?: string | undefined }): string {
  if (!sender.url) throw new Error('request has no sender url');
  return new URL(sender.url).origin;
}

interface Pending {
  login: string;
  password: string;
  signup: boolean;
  origin: string;
  at: number;
}
const PENDING_TTL_MS = 5 * 60_000;
const pendingKey = (tabId: number) => `pending:${tabId}`;

/** In-memory only (storage.session): a submitted password must not outlive the browser. */
async function getPending(tabId: number): Promise<Pending | null> {
  const stored = (await browser.storage.session.get(pendingKey(tabId)))[pendingKey(tabId)] as
    Pending | undefined;
  if (!stored) return null;
  if (Date.now() - stored.at > PENDING_TTL_MS) {
    await browser.storage.session.remove(pendingKey(tabId));
    return null;
  }
  return stored;
}
const setPending = (tabId: number, pending: Pending) =>
  browser.storage.session.set({ [pendingKey(tabId)]: pending });
const clearPending = (tabId: number) => browser.storage.session.remove(pendingKey(tabId));

const view = ({ login, signup, origin, at }: Pending): PendingView => ({
  login,
  signup,
  origin,
  at,
});

async function outcome(tabId: number, success: boolean): Promise<PendingOutcome> {
  const pending = await getPending(tabId);
  if (!pending) return { action: 'none' };
  // A first step ("e-mail → Next") carries no password yet; the next page completes it.
  if (!pending.password) return { action: 'none' };
  if (!success) {
    await clearPending(tabId);
    return { action: 'none' };
  }
  const host = new URL(pending.origin).hostname;
  const settings = await loadSettings();
  if (settings.neverSave.includes(host)) {
    await clearPending(tabId);
    return { action: 'none' };
  }
  const { state } = await call(
    '/creds/check',
    CredsCheckResponse,
    post({ origin: pending.origin, login: pending.login, password: pending.password }),
  );
  if (state === 'same') {
    await clearPending(tabId);
    return { action: 'none' };
  }
  const mode = state === 'new' ? 'new' : 'update';
  if (settings.autoSave) {
    await commit(tabId);
    return { action: 'saved', mode, login: pending.login, host };
  }
  return { action: 'offer-save', mode, login: pending.login, host };
}

async function commit(tabId: number) {
  const pending = await getPending(tabId);
  if (!pending?.password) throw new Error('nothing to save');
  const saved = await call(
    '/creds/save',
    CredsSaveResponse,
    post({
      origin: pending.origin,
      login: pending.login,
      password: pending.password,
      verified: true,
    }),
  );
  await clearPending(tabId);
  return saved;
}

async function handle(
  raw: unknown,
  sender: { url?: string | undefined; tab?: { id?: number | undefined } | undefined },
): Promise<unknown> {
  const message = BackgroundRequest.parse(raw);
  const tabId = sender.tab?.id;
  const needTab = (): number => {
    if (tabId === undefined) throw new Error('request has no tab');
    return tabId;
  };
  switch (message.type) {
    case 'plan':
      return call('/plan', PlanResponse, post({ fields: message.fields, band: message.band }));
    case 'cvs':
      return call('/cvs', CvListResponse, post({}));
    case 'cv':
      return call('/cv', CvResponse, post({ id: message.id }));

    case 'creds-match':
      return call('/creds/match', CredsMatchResponse, post({ origin: senderOrigin(sender) }));
    case 'creds-reveal':
      return call(
        '/creds/reveal',
        CredsRevealResponse,
        post({ origin: senderOrigin(sender), id: message.id }),
      );
    case 'creds-draft':
      return call(
        '/creds/draft',
        CredsDraftResponse,
        post({ origin: senderOrigin(sender), ...message.draft }),
      );
    case 'creds-verified':
      return call(
        '/creds/verified',
        OkResponse,
        post({ origin: senderOrigin(sender), id: message.id }),
      );
    case 'creds-delete':
      return call(
        '/creds/delete',
        OkResponse,
        post({ origin: senderOrigin(sender), id: message.id }),
      );

    case 'pending-set': {
      const id = needTab();
      const origin = senderOrigin(sender);
      const prior = await getPending(id);
      // Password step of a two-step sign-in: the e-mail was typed on the step before.
      const login = message.pending.login || (prior?.origin === origin ? prior.login : '');
      if (login || message.pending.password) {
        await setPending(id, { ...message.pending, login, origin, at: Date.now() });
      }
      return { ok: true };
    }
    case 'pending-get': {
      const pending = await getPending(needTab());
      return { pending: pending ? view(pending) : null };
    }
    case 'pending-outcome':
      return outcome(needTab(), message.success);
    case 'pending-commit':
      return commit(needTab());
    case 'pending-clear':
      await clearPending(needTab());
      return { ok: true };
    case 'spawned':
      return { url: await spawnedUrl(needTab()) };
  }
}

// ── The agent's commands ────────────────────────────────────────────────────────────────────────
// The plan server queues what the agent asks for over MCP; this worker long-polls it, runs the
// command in the right tab through that tab's content script, and posts the result back.

/** tab id -> tabs its page opened (an Apply that goes to an external ATS). Memory only. */
const spawnedBy = new Map<number, number[]>();

async function spawnedUrl(opener: number): Promise<string | null> {
  for (const id of spawnedBy.get(opener) ?? []) {
    const tab = await browser.tabs.get(id).catch(() => null);
    const url = tab?.url || tab?.pendingUrl;
    if (url && url !== 'about:blank') return url;
  }
  return null;
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitComplete(tabId: number, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === 'complete') return;
    await sleepMs(250);
  }
}

async function findTab(target: { tab?: number | undefined; url?: string | undefined }) {
  if (target.tab !== undefined) {
    await browser.tabs.get(target.tab).catch(() => {
      throw new Error(`Tab ${target.tab} is gone.`);
    });
    return target.tab;
  }
  const url = target.url ?? '';
  const hit = (await browser.tabs.query({})).find((t) => url && t.url?.startsWith(url));
  if (hit?.id === undefined) throw new Error(`No open tab starts with ${url}.`);
  return hit.id;
}

/** Ask a tab's content script. It may not be there yet (a page still loading): retry for a while. */
async function toPage<T>(tabId: number, message: PageCommand, patientMs = 20_000): Promise<T> {
  const deadline = Date.now() + patientMs;
  for (;;) {
    try {
      const result = (await browser.tabs.sendMessage(tabId, message)) as
        BackgroundResult<T> | undefined;
      if (result) {
        if (!result.ok) throw new PageError(result.error);
        return result.data;
      }
    } catch (e) {
      if (e instanceof PageError) throw e;
      // "Receiving end does not exist": the content script is not injected yet.
    }
    if (Date.now() > deadline) {
      throw new Error(
        'The page never answered: no Applier adapter runs on it (unsupported site), or it did not finish loading.',
      );
    }
    await sleepMs(300);
  }
}
class PageError extends Error {}

async function runCommand(command: Command): Promise<unknown> {
  switch (command.op) {
    case 'open-and-fill': {
      const tab = await browser.tabs.create({ url: command.url, active: false });
      const tabId = tab.id;
      if (tabId === undefined) throw new Error('Chrome opened no tab.');
      await waitComplete(tabId, 30_000);
      await toPage(tabId, { type: 'page-ping' });
      const summary = await toPage<FillSummary>(
        tabId,
        {
          type: 'page-fill',
          openForm: true,
          ...(command.cv ? { cv: command.cv } : {}),
          ...(command.band ? { band: command.band } : {}),
        },
        60_000,
      );
      if (summary.external) {
        // The offer applies elsewhere: the agent re-opens that address; the tab it spawned is noise.
        for (const id of spawnedBy.get(tabId) ?? [])
          await browser.tabs.remove(id).catch(() => null);
      }
      return { tab: tabId, ...summary };
    }
    case 'fill': {
      const tabId = await findTab(command);
      const summary = await toPage<FillSummary>(
        tabId,
        {
          type: 'page-fill',
          openForm: false,
          ...(command.cv ? { cv: command.cv } : {}),
          ...(command.band ? { band: command.band } : {}),
        },
        60_000,
      );
      return { tab: tabId, ...summary };
    }
    case 'read-form':
      return toPage(await findTab(command), { type: 'page-read' }, 30_000);
    case 'submit': {
      const tabId = await findTab(command);
      // A visible "I'm not a robot" box is ticked first; anything more stops the submit.
      const captcha = await solveCaptcha(tabId);
      if (captcha.status === 'challenge' || captcha.status === 'failed') {
        const result: SubmitResult = {
          submitted: false,
          signal: 'captcha',
          note: `Not pressed: ${captcha.kind ?? 'captcha'} ${captcha.status}. ${captcha.note ?? ''}`.trim(),
        };
        return result;
      }
      return toPage(tabId, { type: 'page-submit', token: command.token }, 30_000);
    }
    case 'captcha':
      return solveCaptcha(await findTab(command));
    case 'close-tab':
      await browser.tabs.remove(await findTab(command));
      return { closed: true };
  }
}

async function runEnvelope({ id, command }: CommandEnvelope): Promise<void> {
  const body = await runCommand(command).then(
    (data) => ({ id, ok: true as const, data }),
    (e: unknown) => ({
      id,
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  await call('/ext/result', OkResponse, post(body)).catch(() => null);
}

let polling = false;
/**
 * One long-poll at a time. The server answers within ~20 s with a command or nothing, and each
 * answer is an event that keeps this worker alive; the alarm restarts the loop if it was killed.
 */
async function pollForCommands(): Promise<void> {
  if (polling) return;
  polling = true;
  try {
    for (;;) {
      try {
        const { command } = await call('/ext/next', ExtNextResponse, post({}));
        if (command) void runEnvelope(command);
      } catch {
        await sleepMs(5_000); // server down: try again shortly
      }
    }
  } finally {
    polling = false;
  }
}

declare const __BUILT_AT__: number;

/**
 * Dev convenience: when a newer build of this extension sits on disk (the server sees it), reload.
 * Chrome does not reload an unpacked extension by itself, and chrome://extensions cannot be driven
 * by a script. Needs the plan server; without one it silently does nothing.
 */
async function reloadIfRebuilt() {
  try {
    const { builtAt } = await call('/build', BuildResponse, post({}));
    if (builtAt !== null && builtAt > __BUILT_AT__ + 1000) browser.runtime.reload();
  } catch {
    /* no server, no build: nothing to do */
  }
}

export default defineBackground(() => {
  browser.alarms.create('rebuilt-check', { periodInMinutes: 0.5 });
  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === 'rebuilt-check') {
      void reloadIfRebuilt();
      void pollForCommands();
    }
  });
  void reloadIfRebuilt();
  void pollForCommands();
  browser.tabs.onCreated.addListener((tab) => {
    if (tab.openerTabId === undefined || tab.id === undefined) return;
    spawnedBy.set(tab.openerTabId, [...(spawnedBy.get(tab.openerTabId) ?? []), tab.id]);
  });
  browser.tabs.onRemoved.addListener((id) => spawnedBy.delete(id));
  browser.runtime.onMessage.addListener((raw: unknown, sender) =>
    handle(raw, sender).then(
      (data): BackgroundResult<unknown> => ({ ok: true, data }),
      (e: unknown): BackgroundResult<unknown> => ({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
    ),
  );
});
