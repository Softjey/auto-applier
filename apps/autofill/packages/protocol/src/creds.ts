import { z } from 'zod';

/**
 * The extension's fixed id, derived from the public `key` in its manifest
 * (see extension/wxt.config.ts). The server hands passwords to this one extension
 * only: any extension can send "Origin: chrome-extension://…", so the origin
 * check alone would let a stranger's extension ask. Override with
 * AUTOFILL_EXTENSION_ID when the extension ships under a store-assigned id.
 */
export const EXTENSION_ID = 'mcliikokokafklkmpghoehofmjpogomo';
export const EXTENSION_MANIFEST_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApr8VuN2au1Ak/YJMtFY2/JfCwBcc3BugdAM7XN6FNLSYdL6Xqw9UR0XjHefYX/LcqkaL5cTQBj5CDhomdmpLicOV4Y8ANMZuTxYq1QfrTKY+rJAyja/zUFREbHh+G1zcAihm/MfA5p5pmwMf4psBvPOMcionKc7jpYBula4t1WU60+tC0uCiNWaMQoR/Agx9h3maQowXNvgW31FnpbMIvGUk/ITfARLsvGtVnCOw3iotdkme9iTMsQsFkcRBEm+JsgFYZouQ35108O6vfjNGJJzaSTlxabGOIbSNGvmTROQqSVSSOpaLUzjjoQcN0g+hkQcCb7vUAMInDsgayEfOswIDAQAB';

/** How well a saved login fits the page it is offered on. */
export const MatchLevel = z.enum(['exact', 'related']);
export type MatchLevel = z.infer<typeof MatchLevel>;

/** A saved login WITHOUT its password — all the page-side ever sees until a fill. */
export const LoginSummary = z.object({
  id: z.string(),
  domain: z.string(),
  login: z.string(),
  level: MatchLevel,
  /** False for an account the extension created that no sign-in has confirmed yet. */
  verified: z.boolean(),
  lastUsedAt: z.string().nullable(),
});
export type LoginSummary = z.infer<typeof LoginSummary>;

export const CredsMatchResponse = z.object({ matches: z.array(LoginSummary) });
export type CredsMatchResponse = z.infer<typeof CredsMatchResponse>;

export const CredsRevealRequest = z.object({ id: z.string().min(1) });
export type CredsRevealRequest = z.infer<typeof CredsRevealRequest>;
export const CredsRevealResponse = z.object({ login: z.string(), password: z.string() });
export type CredsRevealResponse = z.infer<typeof CredsRevealResponse>;

/** What the page saw a person (or the agent) sign in with. */
export const CredsSaveRequest = z.object({
  login: z.string().min(1).max(320),
  password: z.string().min(1).max(512),
  /** The login was just proven by a successful sign-in. */
  verified: z.boolean().default(true),
});
export type CredsSaveRequest = z.infer<typeof CredsSaveRequest>;
export const CredsSaveResponse = z.object({
  id: z.string(),
  /** "created" a new entry, "updated" a changed password, "unchanged" nothing to do. */
  result: z.enum(['created', 'updated', 'unchanged']),
});
export type CredsSaveResponse = z.infer<typeof CredsSaveResponse>;

/** A new account for THIS origin: the server picks the login and generates the password. */
export const CredsDraftRequest = z.object({
  length: z.number().int().min(12).max(64).optional(),
  /** Letters and digits only, for portals that reject punctuation. */
  alphanumeric: z.boolean().optional(),
  /** Replace the stored unverified draft's password instead of reusing it. */
  regenerate: z.boolean().optional(),
});
export type CredsDraftRequest = z.infer<typeof CredsDraftRequest>;
export const CredsDraftResponse = z.object({
  id: z.string(),
  login: z.string(),
  password: z.string(),
});
export type CredsDraftResponse = z.infer<typeof CredsDraftResponse>;

export const CredsIdRequest = z.object({ id: z.string().min(1) });
export type CredsIdRequest = z.infer<typeof CredsIdRequest>;
export const OkResponse = z.object({ ok: z.literal(true) });
export type OkResponse = z.infer<typeof OkResponse>;

/** Is what the page just accepted already stored? "same" also confirms the account. */
export const CredsCheckRequest = z.object({
  login: z.string().min(1).max(320),
  password: z.string().min(1).max(512),
});
export type CredsCheckRequest = z.infer<typeof CredsCheckRequest>;
export const CredsCheckResponse = z.object({ state: z.enum(['new', 'changed', 'same']) });
export type CredsCheckResponse = z.infer<typeof CredsCheckResponse>;
