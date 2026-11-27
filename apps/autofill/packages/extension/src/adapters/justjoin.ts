import { isVisible } from '../core/visibility';
import type { SiteAdapter } from './types';

const APPLY = /^\s*(apply|aplikuj)\b/i;
const SEND = /^\s*(apply|aplikuj|send|wy[sś]lij)\b/i;
const SENT =
  /(application|aplikacja)[^.]{0,40}(has been sent|was sent|zosta[lł]a (wys[lł]ana|przes[lł]ana))|your application has been sent/i;

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
  // The offer page's own Apply (sidebar or sticky footer) opens the modal; the first click after
  // a load is often swallowed, which open-form.ts handles. Buttons inside the form are not it.
  opener: (doc) =>
    [...doc.querySelectorAll<HTMLElement>('button, a')].find(
      (el) =>
        APPLY.test(el.innerText || el.textContent || '') && !el.closest('form') && isVisible(el),
    ) ?? null,
  submitButton: (root) =>
    root.querySelector<HTMLElement>('button[type="submit"]') ??
    [...root.querySelectorAll<HTMLElement>('button')].find((b) =>
      SEND.test(b.innerText || b.textContent || ''),
    ) ??
    null,
  // The modal turns into "Done! Your application has been sent to <company>" and the URL stays.
  submitted: (doc) => SENT.test(doc.body.innerText || doc.body.textContent || ''),
};
