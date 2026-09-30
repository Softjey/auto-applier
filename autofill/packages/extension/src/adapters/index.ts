import { erecruiter } from './erecruiter';
import { justjoin } from './justjoin';
import { nofluffjobs } from './nofluffjobs';
import { traffit } from './traffit';
import type { SiteAdapter } from './types';

export const ADAPTERS: readonly SiteAdapter[] = [traffit, erecruiter, justjoin, nofluffjobs];

export const MATCH_PATTERNS: string[] = ADAPTERS.flatMap((a) => [...a.matchPatterns]);

/** The adapter for a page, or null when this URL carries no supported form. */
export function pickAdapter(url: URL): SiteAdapter | null {
  return ADAPTERS.find((a) => a.matches(url)) ?? null;
}

export type { SiteAdapter };
