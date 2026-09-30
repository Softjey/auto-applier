import type { SiteAdapter } from './types';

/** *.traffit.com — see ats/traffit.com.md. Selectize comboboxes, provisions[] consents. */
export const traffit: SiteAdapter = {
  id: 'traffit',
  matchPatterns: ['https://*.traffit.com/*'],
  // /public/an/<hash> is the job description; the form is /public/form/a/<hash>.
  matches: (url) =>
    /\.traffit\.com$/.test(url.hostname) && url.pathname.startsWith('/public/form/'),
  // "Select all" consent controls also tick the optional future-recruitment
  // box, and they are not inputs of the form we scan — nothing to do here, but
  // a label like this must never be ticked if it ever appears as a checkbox.
  neverTick: /select all|zaznacz wszystk/i,
};
