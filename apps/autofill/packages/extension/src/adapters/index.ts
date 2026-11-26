import { ashby } from './ashby';
import { bamboohr } from './bamboohr';
import { comeet } from './comeet';
import { erecruiter } from './erecruiter';
import { greenhouse } from './greenhouse';
import { justjoin } from './justjoin';
import { lever } from './lever';
import { smartrecruiters } from './smartrecruiters';
import { solidjobs } from './solidjobs';
import { teamtailor } from './teamtailor';
import { traffit } from './traffit';
import type { SiteAdapter, WidgetGroup } from './types';

export const ADAPTERS: readonly SiteAdapter[] = [
  traffit,
  erecruiter,
  justjoin,
  ashby,
  greenhouse,
  lever,
  teamtailor,
  comeet,
  bamboohr,
  smartrecruiters,
  solidjobs,
];

export const MATCH_PATTERNS: string[] = ADAPTERS.flatMap((a) => [...a.matchPatterns]);

/** Hosts that need the page-world selectize bridge — it must not run on every /jobs/ page. */
export const BRIDGE_PATTERNS: string[] = ADAPTERS.filter((a) => a.needsBridge).flatMap((a) => [
  ...a.matchPatterns,
]);

/**
 * The adapter for a page, or null when this URL carries no supported form. Pass the
 * document to let an adapter recognise its ATS on a customer's own domain.
 */
export function pickAdapter(url: URL, doc?: Document): SiteAdapter | null {
  return (
    ADAPTERS.find((a) => a.matches(url)) ??
    (doc ? ADAPTERS.find((a) => a.detect?.(url, doc)) : undefined) ??
    null
  );
}

export type { SiteAdapter, WidgetGroup };
