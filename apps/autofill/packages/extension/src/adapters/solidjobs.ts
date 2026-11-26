import type { SiteAdapter } from './types';

/**
 * solid.jobs's own apply form (solid.jobs/apply/<id>/<slug>) — see ats/solid.jobs.md. Angular
 * Material: `mat-select` and the availability autocomplete are `role=combobox` (driven by the
 * generic combobox), checkboxes are real inputs inside `mat-checkbox`. The skill self-assessment
 * that follows the submit (/apply-succeeded) is the agent's, not this panel's.
 */
export const solidjobs: SiteAdapter = {
  id: 'solidjobs',
  matchPatterns: ['https://solid.jobs/*'],
  matches: (url) => url.hostname === 'solid.jobs' && url.pathname.startsWith('/apply/'),
  scope: (doc) => doc.querySelector('form') ?? doc.querySelector('main'),
  // Mandatory: terms + THIS recruitment. Optional: the future-recruitment consent.
  neverTick: /przysz|future|kolejn/i,
};
