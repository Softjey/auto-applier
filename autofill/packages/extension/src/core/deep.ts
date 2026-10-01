/** This extension's own panels (`applier-autofill`, `applier-passwords`): their fields are not the page's. */
const isOwnPanel = (el: Element): boolean => el.localName.startsWith('applier-');

/**
 * querySelectorAll that also walks into OPEN shadow roots, in document order (a host's shadow
 * content comes right after the host). SmartRecruiters draws its whole form inside shadow DOM;
 * a content script can read open shadow roots, it just has to be told to look.
 */
export function deepAll<T extends Element = HTMLElement>(root: ParentNode, selector: string): T[] {
  const out: T[] = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.matches(selector)) out.push(el as T);
    if (el.shadowRoot && !isOwnPanel(el)) out.push(...deepAll<T>(el.shadowRoot, selector));
  }
  return out;
}

/** The document or shadow root an element lives in — where its labels and ids resolve. */
export const rootOf = (el: Element): Document | ShadowRoot => {
  const node = el.getRootNode();
  return node instanceof ShadowRoot || node instanceof Document ? node : el.ownerDocument;
};
