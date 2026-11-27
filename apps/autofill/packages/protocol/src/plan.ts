import { z } from 'zod';

/** Why a field was left for a human (or for the agent). */
export const ManualReason = z.enum([
  'salary',
  'below-floor',
  'narrative',
  'review',
  'unknown',
  'language-level',
]);
export type ManualReason = z.infer<typeof ManualReason>;

export const Candidate = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  score: z.number(),
});
export type Candidate = z.infer<typeof Candidate>;

export const Cefr = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native']);
export type Cefr = z.infer<typeof Cefr>;

export const SalaryUnit = z.object({
  currency: z.string().length(3),
  period: z.enum(['month', 'hour', 'year']),
  basis: z.enum(['b2b-net', 'uop-gross']),
});
export type SalaryUnit = z.infer<typeof SalaryUnit>;

/** What salary-quote.mjs decided for this vacancy, in the unit the field asks for. */
export const SalaryQuote = z.object({
  amount: z.number().positive(),
  unit: SalaryUnit,
  /** The rule that produced it and the band it was computed from — shown, not hidden. */
  note: z.string(),
});
export type SalaryQuote = z.infer<typeof SalaryQuote>;

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
  /** Money: computed per vacancy by salary-quote.mjs, never taken from a qa[] baseline. */
  z.object({ ...Base, action: z.literal('salary'), quote: SalaryQuote }),
  /** A language-proficiency question: the profile's CEFR level, mapped onto the form's own scale. */
  z.object({ ...Base, action: z.literal('language-level'), cefr: Cefr }),
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
