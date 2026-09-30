import { z } from 'zod';

/** Why a field was left for a human (or for the agent). */
export const ManualReason = z.enum(['salary', 'narrative', 'review', 'unknown', 'language-level']);
export type ManualReason = z.infer<typeof ManualReason>;

export const Candidate = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  score: z.number(),
});
export type Candidate = z.infer<typeof Candidate>;

const Base = { id: z.string().min(1) };

/**
 * What to do with one field. The server owns every decision; the extension
 * only executes. `manual` is the honest outcome for anything that is not a
 * profile fact — it is never guessed.
 */
export const PlanEntry = z.discriminatedUnion('action', [
  z.object({ ...Base, action: z.literal('set'), value: z.string(), source: z.string() }),
  z.object({ ...Base, action: z.literal('check') }),
  z.object({ ...Base, action: z.literal('leave') }),
  z.object({ ...Base, action: z.literal('decline') }),
  z.object({ ...Base, action: z.literal('upload-cv') }),
  z.object({
    ...Base,
    action: z.literal('manual'),
    reason: ManualReason,
    hint: z.string().optional(),
    candidates: z.array(Candidate).optional(),
  }),
  z.object({ ...Base, action: z.literal('skip') }),
]);
export type PlanEntry = z.infer<typeof PlanEntry>;
export type PlanAction = PlanEntry['action'];
