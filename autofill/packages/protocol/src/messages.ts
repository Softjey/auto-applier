import { z } from 'zod';
import { FieldDescriptor } from './field';
import type { CvListResponse, CvResponse, PlanResponse } from './api';

/** Content script -> background service worker. The worker alone talks to the server. */
export const BackgroundRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan'), fields: z.array(FieldDescriptor) }),
  z.object({ type: z.literal('cvs') }),
  z.object({ type: z.literal('cv'), id: z.string() }),
]);
export type BackgroundRequest = z.infer<typeof BackgroundRequest>;

export type BackgroundResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface BackgroundResponses {
  plan: PlanResponse;
  cvs: CvListResponse;
  cv: CvResponse;
}
