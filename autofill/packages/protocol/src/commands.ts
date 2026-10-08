import { z } from 'zod';
import { SalaryBand } from './api';

/**
 * Agent -> extension. The agent talks MCP to the plan server; the server queues one of these and
 * the extension's service worker picks it up (long-poll), runs it in the right tab and posts the
 * result back. No browser-driving tool is involved.
 *
 * A tab is named either by the id an earlier `open-and-fill` returned, or by a URL prefix.
 */
const Target = {
  tab: z.number().int().optional(),
  url: z.string().optional(),
};

export const Command = z.discriminatedUnion('op', [
  /** Open the page in a background tab, open its form if it hides behind a button, fill it. */
  z.object({
    op: z.literal('open-and-fill'),
    url: z.url(),
    cv: z.string().optional(),
    band: SalaryBand.optional(),
  }),
  /** Fill the form that is already showing in a tab. */
  z.object({
    op: z.literal('fill'),
    ...Target,
    cv: z.string().optional(),
    band: SalaryBand.optional(),
  }),
  z.object({ op: z.literal('read-form'), ...Target }),
  /** Press the form's own submit button. Only valid with the token the last fill handed back. */
  z.object({ op: z.literal('submit'), ...Target, token: z.string().min(1) }),
  z.object({ op: z.literal('close-tab'), ...Target }),
  /** Tick a visible "I'm not a robot" checkbox with a real (trusted) mouse; never a challenge. */
  z.object({ op: z.literal('captcha'), ...Target }),
]);
export type Command = z.infer<typeof Command>;

export const CommandEnvelope = z.object({ id: z.string().min(1), command: Command });
export type CommandEnvelope = z.infer<typeof CommandEnvelope>;

export const ExtNextResponse = z.object({ command: CommandEnvelope.nullable() });
export type ExtNextResponse = z.infer<typeof ExtNextResponse>;

export const ExtResultRequest = z.discriminatedUnion('ok', [
  z.object({ id: z.string().min(1), ok: z.literal(true), data: z.unknown() }),
  z.object({ id: z.string().min(1), ok: z.literal(false), error: z.string() }),
]);
export type ExtResultRequest = z.infer<typeof ExtResultRequest>;

/** Background worker -> the page's content script (the page itself is never asked to trust this). */
export const PageCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('page-ping') }),
  z.object({
    type: z.literal('page-fill'),
    cv: z.string().optional(),
    band: SalaryBand.optional(),
    openForm: z.boolean(),
  }),
  z.object({ type: z.literal('page-read') }),
  z.object({ type: z.literal('page-submit'), token: z.string().min(1) }),
]);
export type PageCommand = z.infer<typeof PageCommand>;

/** What a fill hands back to the agent: enough to decide, small enough to read. */
export interface FillSummary {
  adapter: string;
  url: string;
  /** False when the page has no form (yet): wrong page, expired offer, an external ATS opened. */
  formOpen: boolean;
  /** An external ATS opened in a new tab instead of an in-page form. */
  external?: string;
  filled: number;
  cv: 'uploaded' | 'not-asked' | 'no-cv-selected' | 'failed';
  /** Controls that need a human or the agent: not in profile.json / qa[]. */
  manual: { label: string; reason: string; hint?: string }[];
  failed: { label: string; why: string }[];
  /** Choices worth a look (a level mapped onto the form's scale, a date, a band). */
  choices: { label: string; detail: string }[];
  /** The quote would be under the user's floor: do not submit. */
  belowFloor: boolean;
  /** Every control: what became of it. */
  fields: { label: string; status: string; note?: string }[];
  /** Hand this back to `submit`. Absent when nothing was filled. */
  token?: string;
}

export interface FormField {
  label: string;
  kind: string;
  required: boolean;
  /** What the page shows now. */
  value: string;
}

export interface SubmitResult {
  submitted: boolean;
  /**
   * How success was recognised. `none`: pressed, nothing changed — look at the page, do not retry
   * blindly. `captcha`: not pressed, a captcha wants more than a tick (see `note`).
   */
  signal: 'success-text' | 'form-gone' | 'none' | 'captcha';
  note?: string;
}
