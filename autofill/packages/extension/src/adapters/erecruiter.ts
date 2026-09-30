import type { SiteAdapter } from './types';

/**
 * eRecruiter has two unrelated forms behind one brand (see
 * ats/system.erecruiter.pl.md and ats/form.erecruiter.pl.md):
 *  - the new React form at form.erecruiter.pl/form/<guid> — plain names, no traps;
 *  - the old ASP.NET WebForms form at system.erecruiter.pl/FormTemplates/… —
 *    honeypots, and a CV upload that posts back and resets the form.
 */
export const erecruiter: SiteAdapter = {
  id: 'erecruiter',
  matchPatterns: ['https://*.erecruiter.pl/*'],
  matches: (url) =>
    /\.erecruiter\.pl$/.test(url.hostname) &&
    (url.pathname.startsWith('/form/') || /\/FormTemplates\//i.test(url.pathname)),
  // The old form's postback rewrites the region/city selects after the upload,
  // so those must be filled AFTER it. The new form is unaffected by the wait.
  refillAfterCvMs: 2500,
  // ctl61$tbText is the referral e-mail; it must stay empty without a referral.
  ignore: (el) => el instanceof HTMLInputElement && /ctl61\$tbText$/.test(el.name),
};
