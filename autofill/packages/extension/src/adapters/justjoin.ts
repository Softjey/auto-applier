import type { SiteAdapter } from './types';

/** justjoin.it in-page apply modal — see ats/justjoin.it.md. */
export const justjoin: SiteAdapter = {
  id: 'justjoin',
  matchPatterns: ['https://justjoin.it/*'],
  matches: (url) => url.hostname === 'justjoin.it' && url.pathname.startsWith('/job-offer/'),
  // Only the apply form: the offer page has a search form, and a cookie dialog that is
  // also role=dialog (found on live justjoin.it: the modal itself has no dialog role).
  scope: (doc) => doc.querySelector('form:has(input[name="name"])'),
  // The modal has ONE `name` field, not a given/family pair, and a bare "Name"
  // would resolve to the given name alone.
  label: (el) =>
    el.getAttribute('name') === 'name' ? 'Full name (first and last name)' : undefined,
  // Creating an account and marketing consents are out of scope and NOT
  // required for the application to go through.
  neverTick: /account|konto|terms|regulamin|marketing|newsletter|future|przysz/i,
};
