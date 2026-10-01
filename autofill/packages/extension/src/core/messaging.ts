import type {
  BackgroundRequest,
  CredsDraftRequest,
  BackgroundResponses,
  BackgroundResult,
  FieldDescriptor,
  SalaryBand,
} from '@applier/protocol';

/** The only door from a page-side script to the local server. */
export interface Backend {
  plan(fields: FieldDescriptor[], band?: SalaryBand): Promise<BackgroundResponses['plan']>;
  cvs(): Promise<BackgroundResponses['cvs']>;
  cv(id: string): Promise<BackgroundResponses['cv']>;
}

async function send<K extends BackgroundRequest['type']>(
  message: Extract<BackgroundRequest, { type: K }>,
): Promise<BackgroundResponses[K]> {
  const result = (await browser.runtime.sendMessage(message)) as
    BackgroundResult<BackgroundResponses[K]> | undefined;
  if (!result) throw new Error('The extension background did not answer.');
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const chromeBackend: Backend = {
  plan: (fields, band) => send({ type: 'plan', fields, ...(band ? { band } : {}) }),
  cvs: () => send({ type: 'cvs' }),
  cv: (id) => send({ type: 'cv', id }),
};

/** The password manager's door to the server, via the worker. The page never names an origin. */
export interface CredsBackend {
  match(): Promise<BackgroundResponses['creds-match']>;
  reveal(id: string): Promise<BackgroundResponses['creds-reveal']>;
  draft(options?: CredsDraftRequest): Promise<BackgroundResponses['creds-draft']>;
  verified(id: string): Promise<unknown>;
  forget(id: string): Promise<unknown>;
  pendingSet(pending: { login: string; password: string; signup: boolean }): Promise<unknown>;
  pendingGet(): Promise<BackgroundResponses['pending-get']>;
  pendingOutcome(success: boolean): Promise<BackgroundResponses['pending-outcome']>;
  pendingCommit(): Promise<BackgroundResponses['pending-commit']>;
  pendingClear(): Promise<unknown>;
}

export const chromeCreds: CredsBackend = {
  match: () => send({ type: 'creds-match' }),
  reveal: (id) => send({ type: 'creds-reveal', id }),
  draft: (draft = {}) => send({ type: 'creds-draft', draft }),
  verified: (id) => send({ type: 'creds-verified', id }),
  forget: (id) => send({ type: 'creds-delete', id }),
  pendingSet: (pending) => send({ type: 'pending-set', pending }),
  pendingGet: () => send({ type: 'pending-get' }),
  pendingOutcome: (success) => send({ type: 'pending-outcome', success }),
  pendingCommit: () => send({ type: 'pending-commit' }),
  pendingClear: () => send({ type: 'pending-clear' }),
};
