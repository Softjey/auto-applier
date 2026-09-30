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

export function isVisible(el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
  }
  // Layout-dependent check only when the environment has layout at all.
  if (hasLayout(el.ownerDocument)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
  }
  return true;
}
