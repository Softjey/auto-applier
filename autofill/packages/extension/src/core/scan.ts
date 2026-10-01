import type { FieldDescriptor, FieldKind, FieldOption } from '@applier/protocol';
import type { SiteAdapter, WidgetGroup } from '../adapters';
import { comboOptions, isListCombobox, isPopoverSelect } from './combobox';
import { deepAll } from './deep';
import { groupQuestion, labelFor, looksRequired, widgetLabel } from './labels';
import { selectizeOptions } from './selectize';
import { clean } from './text';
import type { Control } from './types';
import { isHoneypotName, isVisible } from './visibility';

// `button[role=combobox]` is a Radix / shadcn Select trigger; its native <select> twin is aria-hidden.
// A button that opens a popover list is a candidate too; describe() drops it if the list is empty.
const CONTROLS =
  'input, select, textarea, [role="combobox"]:not(input), button[aria-haspopup="dialog"], button[aria-haspopup="listbox"]';
const TEXT_TYPES: Record<string, FieldKind> = {
  text: 'text',
  search: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
};
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password']);

/** Cookie-consent widgets (OneTrust, Cookiebot…) live in the DOM of every page; they are not the form. */
const COOKIE_WIDGET =
  '#onetrust-consent-sdk, #CybotCookiebotDialog, [id*="cookie" i], [class*="cookie" i], [aria-label*="cookie" i]';

/**
 * A lone checkbox nobody labelled ("on" is just its default value) and that is not
 * required — e.g. a "message for the employer" switch — is not a question.
 */
const isMeaninglessToggle = ({ descriptor: d }: Control): boolean =>
  d.kind === 'checkbox-group' &&
  d.options?.length === 1 &&
  (d.label === '' || d.label.toLowerCase() === 'on') &&
  !d.required;

const isChoice = (el: HTMLElement): boolean =>
  el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');

const isSelectized = (el: Element): boolean => el.classList.contains('selectized');
/** The text input selectize renders in front of its hidden <select>. */
const isSelectizeShell = (el: HTMLElement): boolean =>
  el.closest('.selectize-control') !== null || /-selectized$/.test(el.id);

type Group = WidgetGroup;

/**
 * react-select parks an invisible, read-only twin of its input beside it (so the browser can
 * enforce `required`). It is not a field; only the combobox next to it is.
 */
const isRequiredShadow = (el: HTMLElement): boolean =>
  el instanceof HTMLInputElement &&
  el.tabIndex === -1 &&
  el.readOnly &&
  el.ownerDocument.defaultView?.getComputedStyle(el).opacity === '0';

/**
 * Turns the form into Controls: one per real field, honeypots and shells
 * dropped, radio/checkbox inputs folded into groups, selectize options fetched
 * from the page world. Read-only — nothing is typed or clicked.
 */
export async function scan(root: ParentNode, adapter: SiteAdapter): Promise<Control[]> {
  const elements = deepAll(root, CONTROLS);
  // Document order across shadow roots, which compareDocumentPosition cannot give.
  const position = new Map(deepAll(root, '*').map((e, i) => [e, i]));
  const order = (a: HTMLElement, b: HTMLElement): number =>
    (position.get(a) ?? 0) - (position.get(b) ?? 0);
  const groups = new Map<string, Group>();
  const controls: Control[] = [];
  let n = 0;
  const nextId = () => `af${++n}`;

  for (const el of elements) {
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
    if (isSelectizeShell(el) || isRequiredShadow(el) || el.closest(COOKIE_WIDGET)) continue;

    const selectized = el instanceof HTMLSelectElement && isSelectized(el);
    if (
      !selectized &&
      (isHoneypotName(el.getAttribute('name') ?? '') || !isVisible(el, !isChoice(el)))
    ) {
      // File inputs are routinely hidden behind a styled button; keep them.
      if (!(el instanceof HTMLInputElement && el.type === 'file')) continue;
    }

    const label = adapter.label?.(el, elements.indexOf(el), elements) ?? labelFor(el);
    if (adapter.ignore?.(el, label)) continue;

    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      const key = `${el.type}:${el.name || `#${elements.indexOf(el)}`}`;
      const group = groups.get(key) ?? {
        kind: el.type === 'radio' ? 'radio-group' : 'checkbox-group',
        members: [],
      };
      group.members.push(el);
      groups.set(key, group);
      continue;
    }

    const control = await describe(el, label, nextId(), selectized);
    if (control) controls.push(control);
  }

  for (const group of [
    ...groups.values(),
    ...ariaGroups(root),
    ...(adapter.groups?.(root) ?? []),
  ]) {
    const control = describeGroup(group, nextId());
    if (!isMeaninglessToggle(control)) controls.push(control);
  }

  // Keep page order across the two passes.
  return controls.sort((a, b) => order(a.el, b.el));
}

async function describe(
  el: HTMLElement,
  label: string,
  id: string,
  selectized: boolean,
): Promise<Control | null> {
  let kind: FieldKind = 'other';
  let options: FieldOption[] | undefined;
  let optionsHidden: boolean | undefined;

  if (selectized) {
    kind = 'combobox';
    options = (await selectizeOptions(el, id)) ?? undefined;
    if (!options) optionsHidden = true;
  } else if (isListCombobox(el)) {
    // react-select / Radix: the options exist only while the list is open, so open it and read.
    kind = 'combobox';
    const found = await comboOptions(el);
    if (found.length === 0 && isPopoverSelect(el)) return null; // a date picker, not a select
    if (found.length > 0) options = found;
    else optionsHidden = true; // an async autocomplete: it offers rows only once you type
  } else if (el instanceof HTMLSelectElement) {
    kind = 'select';
    options = [...el.options]
      .map((o) => ({ value: o.value, label: clean(o.text) }))
      .filter((o) => o.label !== '');
  } else if (el instanceof HTMLTextAreaElement) {
    kind = 'textarea';
  } else if (el instanceof HTMLInputElement) {
    kind = el.type === 'file' ? 'file' : (TEXT_TYPES[el.type] ?? 'other');
  }

  const descriptor: FieldDescriptor = {
    id,
    label,
    key: el.getAttribute('name') ?? el.id,
    kind,
    required: (el as HTMLInputElement).required || looksRequired(label),
    ...(options ? { options } : {}),
    ...(optionsHidden ? { optionsHidden } : {}),
  };
  return { descriptor, el, members: [] };
}

/**
 * Radix / shadcn forms (the new eRecruiter, many others) draw radios and
 * checkboxes as `<button role="radio|checkbox">`; the native inputs beside them
 * are aria-hidden shadows nobody can operate. Read the widgets instead.
 */
function ariaGroups(root: ParentNode): Group[] {
  const usable = (el: HTMLElement) => !el.closest(COOKIE_WIDGET) && isVisible(el, false);
  const groups: Group[] = [];
  for (const rg of deepAll(root, '[role="radiogroup"]')) {
    const members = deepAll(rg, '[role="radio"]');
    if (members.length && usable(rg)) {
      groups.push({
        kind: 'radio-group',
        members,
        question: labelFor(rg),
        required: rg.getAttribute('aria-required') === 'true',
      });
    }
  }
  const boxes = deepAll(root, '[role="checkbox"]').filter(usable);
  const clustered = new Set<HTMLElement>();
  for (const members of checkboxClusters(boxes)) {
    members.forEach((m) => clustered.add(m));
    groups.push({
      kind: 'checkbox-group',
      members,
      required: members[0]?.closest('[aria-required="true"]') !== null,
    });
  }
  for (const box of boxes) {
    if (clustered.has(box)) continue;
    groups.push({
      kind: 'checkbox-group',
      members: [box],
      required: box.getAttribute('aria-required') === 'true',
    });
  }
  return groups;
}

const OPTION_LABEL_MAX = 40;
const OTHER_CONTROLS =
  'input:not([aria-hidden="true"]), select, textarea, [role="combobox"], [role="radiogroup"]';

/**
 * Radix checkboxes that answer ONE question ("Preferowany rodzaj umowy: UoP / B2B") are
 * siblings under a shared wrapper; each on its own would read as a separate consent. Climb to
 * the smallest wrapper holding several of them and no other control. Long labels are
 * consents, so a wrapper of those is not a choice list.
 */
function checkboxClusters(boxes: HTMLElement[]): HTMLElement[][] {
  const clusters: HTMLElement[][] = [];
  const seen = new Set<HTMLElement>();
  for (const box of boxes) {
    if (seen.has(box)) continue;
    let node: HTMLElement | null = box.parentElement;
    let found: HTMLElement[] | null = null;
    for (let hops = 0; node && hops < 4; hops++, node = node.parentElement) {
      const inside = boxes.filter((b) => node?.contains(b));
      if (node.querySelector(OTHER_CONTROLS)) break;
      if (inside.length > 1) {
        found = inside;
        break;
      }
    }
    if (!found || found.some((b) => memberLabel(b).length > OPTION_LABEL_MAX)) continue;
    found.forEach((b) => seen.add(b));
    clusters.push(found);
  }
  return clusters;
}

// A segmented button has no label wiring: its own text ("Yes") is its label.
const memberLabel = (m: HTMLElement): string =>
  m instanceof HTMLInputElement ? labelFor(m) : widgetLabel(m) || clean(m.textContent);
const memberKey = (m: HTMLElement): string =>
  m instanceof HTMLInputElement ? m.value : (m.getAttribute('value') ?? '');
const memberRequired = (m: HTMLElement): boolean => m instanceof HTMLInputElement && m.required;

function describeGroup(group: Group, id: string): Control {
  const first = group.members[0] as HTMLElement;
  const legend = first.closest('fieldset')?.querySelector('legend');
  const options: FieldOption[] = group.members.map((m) => {
    const label = memberLabel(m);
    return { value: memberKey(m) || label, label: label || memberKey(m) };
  });
  // A single checkbox IS the question (every consent box); a group's question is its
  // legend, or failing that the text above its options.
  const label =
    group.question ||
    (legend
      ? clean(legend.textContent)
      : group.members.length === 1
        ? (options[0]?.label ?? '')
        : groupQuestion(group.members) || (options[0]?.label ?? ''));
  return {
    descriptor: {
      id,
      label,
      key: first.getAttribute('name') ?? first.id,
      kind: group.kind,
      required:
        group.required === true || group.members.some(memberRequired) || looksRequired(label),
      options,
    },
    el: first,
    members: group.members,
  };
}
