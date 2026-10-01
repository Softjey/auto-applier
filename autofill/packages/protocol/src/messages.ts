import { z } from 'zod';
import { FieldDescriptor } from './field';
import { SalaryBand, type CvListResponse, type CvResponse, type PlanResponse } from './api';
import {
  CredsDraftRequest,
  type CredsDraftResponse,
  type CredsMatchResponse,
  type CredsRevealResponse,
  type CredsSaveResponse,
  type OkResponse,
} from './creds';

/** Content script -> background service worker. The worker alone talks to the server. */
export const BackgroundRequest = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('plan'),
    fields: z.array(FieldDescriptor),
    band: SalaryBand.optional(),
  }),
  z.object({ type: z.literal('cvs') }),
  z.object({ type: z.literal('cv'), id: z.string() }),
  // Password manager. The page never says WHICH origin it is on: the worker takes it from
  // the browser-supplied sender, so a script on the page cannot ask for another site's login.
  z.object({ type: z.literal('creds-match') }),
  z.object({ type: z.literal('creds-reveal'), id: z.string() }),
  z.object({ type: z.literal('creds-draft'), draft: CredsDraftRequest }),
  z.object({ type: z.literal('creds-verified'), id: z.string() }),
  z.object({ type: z.literal('creds-delete'), id: z.string() }),
  // A submitted login waits here (in memory, per tab) until the next page shows whether it worked.
  z.object({
    type: z.literal('pending-set'),
    pending: z.object({ login: z.string(), password: z.string(), signup: z.boolean() }),
  }),
  z.object({ type: z.literal('pending-get') }),
  // The page reports how the submit went; the worker (which alone holds the password) decides
  // whether anything is worth saving and says so — the password never travels back.
  z.object({ type: z.literal('pending-outcome'), success: z.boolean() }),
  z.object({ type: z.literal('pending-commit') }),
  z.object({ type: z.literal('pending-clear') }),
]);
export type BackgroundRequest = z.infer<typeof BackgroundRequest>;

export type BackgroundResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface BackgroundResponses {
  plan: PlanResponse;
  cvs: CvListResponse;
  cv: CvResponse;
  'creds-match': CredsMatchResponse;
  'creds-reveal': CredsRevealResponse;
  'creds-draft': CredsDraftResponse;
  'creds-verified': OkResponse;
  'creds-delete': OkResponse;
  'pending-set': OkResponse;
  'pending-get': { pending: PendingView | null };
  'pending-outcome': PendingOutcome;
  'pending-commit': CredsSaveResponse;
  'pending-clear': OkResponse;
}

/** What the page may know about a submitted login: who and where, never the password. */
export interface PendingView {
  login: string;
  signup: boolean;
  /** Origin the form was submitted on; the save is for it, wherever the tab lands. */
  origin: string;
  at: number;
}

export type PendingOutcome =
  | { action: 'none' }
  | { action: 'offer-save'; mode: 'new' | 'update'; login: string; host: string }
  /** Saved without asking, because the user turned auto-save on. */
  | { action: 'saved'; mode: 'new' | 'update'; login: string; host: string };
