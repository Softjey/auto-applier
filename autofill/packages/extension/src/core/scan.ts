import type { FieldDescriptor, FieldKind, FieldOption } from '@applier/protocol';
import type { SiteAdapter } from '../adapters';
import { labelFor, looksRequired } from './labels';
import { selectizeOptions } from './selectize';
import { clean } from './text';
import type { Control } from './types';
import { isHoneypotName, isVisible } from './visibility';

const CONTROLS = 'input, select, textarea';
const TEXT_TYPES: Record<string, FieldKind> = {
  text: 'text',
  search: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
};
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password']);

const isSelectized = (el: Element): boolean => el.classList.contains('selectized');
/** The text input selectize renders in front of its hidden <select>. */
const isSelectizeShell = (el: HTMLElement): boolean =>
  el.closest('.selectize-control') !== null || /-selectized$/.test(el.id);

interface Group {
  kind: 'checkbox-group' | 'radio-group';
  members: HTMLInputElement[];
}

/**
 * Turns the form into Controls: one per real field, honeypots and shells
 * dropped, radio/checkbox inputs folded into groups, selectize options fetched
 * from the page world. Read-only — nothing is typed or clicked.
 */
export async function scan(root: ParentNode, adapter: SiteAdapter): Promise<Control[]> {
  const elements = [...root.querySelectorAll<HTMLElement>(CONTROLS)];
  const groups = new Map<string, Group>();
  const controls: Control[] = [];
  let n = 0;
  const nextId = () => `af${++n}`;

  for (const el of elements) {
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
    if (isSelectizeShell(el)) continue;

    const selectized = el instanceof HTMLSelectElement && isSelectized(el);
    if (!selectized && (isHoneypotName(el.getAttribute('name') ?? '') || !isVisible(el))) {
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

    controls.push(await describe(el, label, nextId(), selectized));
  }

  for (const group of groups.values()) controls.push(describeGroup(group, nextId()));

  // Keep page order across the two passes.
  return controls.sort((a, b) => order(a.el, b.el));
}

const order = (a: HTMLElement, b: HTMLElement): number =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

async function describe(
  el: HTMLElement,
  label: string,
  id: string,
  selectized: boolean,
): Promise<Control> {
  let kind: FieldKind = 'other';
  let options: FieldOption[] | undefined;
  let optionsHidden: boolean | undefined;

  if (selectized) {
    kind = 'combobox';
    options = (await selectizeOptions(el, id)) ?? undefined;
    if (!options) optionsHidden = true;
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

function describeGroup(group: Group, id: string): Control {
  const first = group.members[0] as HTMLInputElement;
  const legend = first.closest('fieldset')?.querySelector('legend');
  const options: FieldOption[] = group.members.map((m) => ({
    value: m.value,
    label: labelFor(m) || m.value,
  }));
  // A single checkbox IS the question (every consent box); a group's question is its legend.
  const label = legend ? clean(legend.textContent) : (options[0]?.label ?? '');
  return {
    descriptor: {
      id,
      label,
      key: first.name,
      kind: group.kind,
      required: group.members.some((m) => m.required) || looksRequired(label),
      options,
    },
    el: first,
    members: group.members,
  };
}
