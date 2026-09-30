import { z } from 'zod';
import { FieldDescriptor } from './field';
import { PlanEntry } from './plan';

export const DEFAULT_PORT = 7357;
export const SERVER_ORIGIN = `http://127.0.0.1:${DEFAULT_PORT}`;

export const PlanRequest = z.object({ fields: z.array(FieldDescriptor).max(500) });
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
