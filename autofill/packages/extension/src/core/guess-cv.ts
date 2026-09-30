import type { CvSummary } from '@applier/protocol';
import { normalize } from './text';

/**
 * Tailored CV folders are named <Company>_<vacancyId>-<Title>. Pre-select the
 * one whose company appears in the page's title or host; otherwise choose
 * nothing — attaching the wrong company's CV is worse than attaching none.
 */
export function guessCv(cvs: readonly CvSummary[], pageTitle: string, host: string): string | null {
  const haystack = normalize(`${pageTitle} ${host}`).replace(/ /g, '');
  let best: { id: string; len: number } | null = null;
  for (const cv of cvs) {
    const company = normalize(cv.label.split('_')[0] ?? '').replace(/ /g, '');
    if (company.length >= 3 && haystack.includes(company) && (!best || company.length > best.len)) {
      best = { id: cv.id, len: company.length };
    }
  }
  return best?.id ?? null;
}
