import { z } from 'zod';
import { FieldDescriptor } from './field';
import { PlanEntry, SalaryUnit } from './plan';

/**
 * Dev default 7357. AUTOFILL_PORT overrides it at runtime (server) and at BUILD time (the
 * extension bundle: wxt.config.ts defines it), so the e2e suite runs its own server on its own
 * port and can never talk to the dev server that holds the real profile and passwords.
 */
// Node has a real `process`; the extension bundle gets this exact expression replaced at build time.
declare const process: { env: { AUTOFILL_PORT?: string } };
export const DEFAULT_PORT = Number(process.env.AUTOFILL_PORT || 7357);
export const SERVER_ORIGIN = `http://127.0.0.1:${DEFAULT_PORT}`;

/** The band the VACANCY published, as typed by the user in the panel. Optional: none means "no band". */
export const SalaryBand = z.object({
  min: z.number().positive().optional(),
  max: z.number().positive().optional(),
  unit: SalaryUnit,
});
export type SalaryBand = z.infer<typeof SalaryBand>;

export const PlanRequest = z.object({
  fields: z.array(FieldDescriptor).max(500),
  band: SalaryBand.optional(),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const PlanResponse = z.object({ plan: z.array(PlanEntry) });
export type PlanResponse = z.infer<typeof PlanResponse>;

export const CvSummary = z.object({ id: z.string(), label: z.string() });
export type CvSummary = z.infer<typeof CvSummary>;

export const CvListResponse = z.object({ cvs: z.array(CvSummary) });
export type CvListResponse = z.infer<typeof CvListResponse>;

export const CvRequest = z.object({ id: z.string().min(1) });
export type CvRequest = z.infer<typeof CvRequest>;

export const CvResponse = z.object({ name: z.string(), base64: z.string() });
export type CvResponse = z.infer<typeof CvResponse>;

export const ErrorResponse = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** When the extension build on disk was last written (ms): the running extension reloads itself if this is newer than its own. */
export const BuildResponse = z.object({ builtAt: z.number().nullable() });
export type BuildResponse = z.infer<typeof BuildResponse>;
