import {
  BackgroundRequest,
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
} from '@applier/protocol';
import type { ZodType } from 'zod';
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
  }
}

export default defineBackground(() => {
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
