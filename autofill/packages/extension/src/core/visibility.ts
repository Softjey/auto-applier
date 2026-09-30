/**
 * "Would a person see this control?" — the test that separates real fields
 * from anti-autofill honeypots (eRecruiter parks invisible twins next to the
 * real inputs; writing into one silently loses the answer).
 */
const HONEYPOT_NAME = /fakeuser|fakepass|honeypot|bot[-_]?trap|remembered/i;

export const isHoneypotName = (name: string): boolean => HONEYPOT_NAME.test(name);

function hasLayout(doc: Document): boolean {
  const r = doc.documentElement.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * `checkSize: false` for checkboxes and radios: sites routinely hide the native
 * input at zero size behind a styled box that IS visible, and dropping those
 * loses mandatory consents (found on live eRecruiter). Only an ancestor that is
 * itself display:none / hidden counts against them.
 */
export function isVisible(el: HTMLElement, checkSize = true): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
  }
  // Layout-dependent check only when the environment has layout at all.
  if (checkSize && hasLayout(el.ownerDocument)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
  }
  return true;
}
