import { clean } from './text';

const CONTAINER =
  '.form-group, .form__group, .field, fieldset, [class*="form-group"], [class*="field"]';

const byId = (root: Document | ShadowRoot, id: string): HTMLElement | null =>
  root.getElementById(id);

/** The visible question a control answers, as text. Best effort, never throws. */
export function labelFor(el: HTMLElement): string {
  const doc = el.ownerDocument;

  const aria = el.getAttribute('aria-label');
  if (aria && clean(aria)) return clean(aria);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => byId(doc, id)?.textContent)
        .join(' '),
    );
    if (text) return text;
  }

  if (el.id) {
    for (const label of doc.querySelectorAll('label')) {
      if (label.htmlFor === el.id && clean(label.textContent)) return clean(label.textContent);
    }
  }

  const wrapping = el.closest('label');
  if (wrapping && clean(wrapping.textContent)) return clean(wrapping.textContent);

  const legend = el.closest('fieldset')?.querySelector('legend');
  if (legend && clean(legend.textContent)) return clean(legend.textContent);

  // Last resort: the first line of text in the control's own row.
  const row = el.closest(CONTAINER);
  if (row) {
    const first = (row as HTMLElement).innerText?.split('\n').map(clean).find(Boolean);
    if (first) return first;
    const text = clean(row.textContent);
    if (text) return text.slice(0, 120);
  }
  return clean(el.getAttribute('placeholder'));
}

export const looksRequired = (label: string): boolean => /\*|obowi[aą]zkowe/i.test(label);
