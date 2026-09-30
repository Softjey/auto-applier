import type { SiteAdapter } from './types';

/**
 * No Fluff Jobs in-page apply modal — see ats/nofluffjobs.com.md.
 * Its inputs have no name and no id, and `input.checked` lies on every
 * checkbox (hidden native inputs behind styled boxes), so checkboxes are left
 * to the user and inputs are identified by DOM order.
 */
const ORDER = ['Full name (first and last name)', 'E-mail address', 'Phone number'];

export const nofluffjobs: SiteAdapter = {
  id: 'nofluffjobs',
  matchPatterns: ['https://nofluffjobs.com/*'],
  matches: (url) =>
    url.hostname === 'nofluffjobs.com' && /^\/(?:[a-z]{2}\/)?job\//.test(url.pathname),
  scope: (doc) => doc.querySelector('[role="dialog"], nfj-apply-modal, [class*="modal"]'),
  label(el, _index, siblings) {
    const named = el.getAttribute('name') || el.id;
    if (named) return undefined;
    // Position among the text-like inputs of the modal, not among all controls.
    const inputs = siblings.filter(
      (s) => s instanceof HTMLInputElement && ['text', 'email', 'tel'].includes(s.type),
    );
    const position = inputs.indexOf(el);
    return position >= 0 ? ORDER[position] : undefined;
  },
  leaveCheckboxes: true,
};
