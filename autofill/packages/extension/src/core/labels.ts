import { clean } from './text';

const CONTAINER =
  '.form-group, .form__group, .field, fieldset, [class*="form-group"], [class*="field"]';

/**
 * Label of an ARIA radio/checkbox (`<button role="radio">`): a widget has no native
 * label wiring, so try the usual routes and then the text beside it in its own row.
 */
export function widgetLabel(el: HTMLElement): string {
  const direct = labelFor(el, false);
  if (direct) return direct;
  const parent = el.parentElement;
  return parent ? rowText(parent) : '';
}

const byId = (root: Document | ShadowRoot, id: string): HTMLElement | null =>
  root.getElementById(id);

/** The visible question a control answers, as text. Best effort, never throws. */
export function labelFor(el: HTMLElement, rowFallback = true): string {
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
  const row = rowFallback ? el.closest(CONTAINER) : null;
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

/**
 * The question above a radio/checkbox group that has no <legend>: the first line
 * of text in the smallest ancestor holding every member that is not one of the
 * options' own labels. Climbs a few levels: the options are often wrapped once more.
 */
export function groupQuestion(members: readonly HTMLElement[]): string {
  const first = members[0];
  if (!first) return '';
  const doc = first.ownerDocument;
  // The options' own labels — wrapping <label>s and <label for=id>s — are not the question.
  const optionLabels = members.flatMap((m) => {
    const own = [m.closest('label')];
    if (m.id) own.push(doc.querySelector(`label[for="${m.id}"]`));
    return own.filter((l): l is HTMLLabelElement => l !== null);
  });
  let node: HTMLElement | null = first.parentElement;
  while (node && !members.every((m) => node?.contains(m))) node = node.parentElement;

  for (let hops = 0; node && hops < 3; hops++, node = node.parentElement) {
    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const line = clean(text.textContent);
      const host = text.parentElement;
      if (!line || !host || host.closest('script, style, button, select, option, textarea'))
        continue;
      if (optionLabels.some((l) => l.contains(text))) continue;
      return line.slice(0, 160);
    }
  }
  return '';
}
