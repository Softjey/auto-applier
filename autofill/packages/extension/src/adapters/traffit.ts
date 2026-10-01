import type { SiteAdapter } from './types';

/** *.traffit.com — see ats/traffit.com.md. Selectize comboboxes, provisions[] consents. */
export const traffit: SiteAdapter = {
  id: 'traffit',
  matchPatterns: ['https://*.traffit.com/*'],
  needsBridge: true,
  // /public/an/<hash> is the job description; the form is /public/form/a/<hash>.
  matches: (url) =>
    /\.traffit\.com$/.test(url.hostname) && url.pathname.startsWith('/public/form/'),
  // "Select all" consent controls also tick the optional future-recruitment
  // box, and they are not inputs of the form we scan — nothing to do here, but
  // a label like this must never be ticked if it ever appears as a checkbox.
  // "Mark all / Unmark all" flips every consent at once, including the optional ones.
  ignore: (el, label) =>
    (el as HTMLInputElement).name === 'markAll' ||
    /mark all|zaznacz wszystk|odznacz wszystk/i.test(label),
  neverTick: /select all|zaznacz wszystk/i,
};
