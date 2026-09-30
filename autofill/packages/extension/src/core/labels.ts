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

  // Deliberately no <legend> here: a fieldset's legend names a SECTION ("Personal
  // data") or a radio/checkbox group, never a single text/select control inside
  // it. scan.ts reads the legend itself, for groups only (found on live Traffit).
  // Last resort: the first line of text in the control's own row.
  const row = el.closest(CONTAINER);
  if (row) {
    const text = rowText(row);
    if (text) return text;
  }
  return clean(el.getAttribute('placeholder'));
}

export const looksRequired = (label: string): boolean => /\*|obowi[aą]zkowe/i.test(label);

/**
 * The row's own words: controls, their options and scripts are stripped first,
 * or a <select>'s option texts end up glued onto its label. Works the same in
 * a real browser and in a layout-less test DOM (no reliance on innerText).
 */
function rowText(row: Element): string {
  const copy = row.cloneNode(true) as Element;
  copy
    .querySelectorAll('select, option, input, textarea, script, style, button')
    .forEach((n) => n.remove());
  const lines = (copy.textContent ?? '').split('\n').map(clean).filter(Boolean);
  return (lines[0] ?? '').slice(0, 120);
}
