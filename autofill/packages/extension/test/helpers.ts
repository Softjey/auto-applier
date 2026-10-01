import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Backend } from '../src/core/messaging';
import type { FieldDescriptor, PlanEntry } from '@applier/protocol';

export const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

/** Stand-in for the page-world selectize bridge (page-bridge.content.ts). */
export function installFakeBridge(options: Record<string, { id: string; label: string }[]>): void {
  document.addEventListener('af-req', (e) => {
    const req = JSON.parse((e as CustomEvent<string>).detail) as {
      id: string;
      op: string;
      target: string;
      optionId?: string;
    };
    const el = document.querySelector(`[data-af-id="${req.target}"]`) as HTMLSelectElement | null;
    const list = options[el?.getAttribute('name') ?? ''];
    const reply = (payload: unknown) =>
      document.dispatchEvent(
        new CustomEvent(`af-res-${req.id}`, { detail: JSON.stringify(payload) }),
      );
    if (!el || !list) return reply({ ok: false });
    if (req.op === 'options') return reply({ ok: true, options: list });
    el.dataset['chosen'] = req.optionId ?? '';
    reply({ ok: true });
  });
}

type Rule = (f: FieldDescriptor) => PlanEntry | undefined;

/** A Backend whose plan comes from label rules; the first rule to answer wins. */
export function fakeBackend(
  rules: Rule[],
  cv = { name: 'CV.pdf', base64: btoa('%PDF-1.4 test') },
): Backend & { asked: FieldDescriptor[] } {
  const asked: FieldDescriptor[] = [];
  return {
    asked,
    plan: async (fields) => {
      asked.push(...fields);
      return {
        plan: fields.map(
          (f) =>
            rules.map((r) => r(f)).find(Boolean) ?? {
              id: f.id,
              action: 'manual',
              reason: 'unknown' as const,
            },
        ),
      };
    },
    cvs: async () => ({ cvs: [] }),
    cv: async () => cv,
  };
}

export const when =
  (re: RegExp, make: (f: FieldDescriptor) => Omit<PlanEntry, 'id'>): Rule =>
  (f) =>
    re.test(f.label) ? ({ id: f.id, ...make(f) } as PlanEntry) : undefined;

interface FakeComboboxOptions {
  /** The rows: fixed, or computed from what was typed (an async autocomplete). */
  rows: string[] | ((typed: string) => string[]);
  /** Ignore mouse clicks on rows — the list can then only be driven from the keyboard. */
  keyboardOnly?: boolean;
}

/**
 * Stand-in for react-select / Radix Select: a `role=combobox` control that opens a
 * `role=listbox` of `role=option` rows on ArrowDown, closes on Escape, and shows the pick
 * (a button's own text with `data-placeholder` removed; an input's `.select__single-value`).
 */
export function mountFakeCombobox(control: HTMLElement, options: FakeComboboxOptions): void {
  let list: HTMLElement | null = null;
  let active = -1;
  const rowsFor = () =>
    typeof options.rows === 'function'
      ? options.rows(control instanceof HTMLInputElement ? control.value : '')
      : options.rows;

  const close = () => {
    list?.remove();
    list = null;
    active = -1;
    control.setAttribute('aria-expanded', 'false');
  };
  const choose = (label: string) => {
    if (control instanceof HTMLButtonElement) {
      control.textContent = label;
      control.removeAttribute('data-placeholder');
    } else {
      const box = control.closest('.select__control') ?? control.parentElement!;
      const value = document.createElement('div');
      value.className = 'select__single-value';
      value.textContent = label;
      box.prepend(value);
      (control as HTMLInputElement).value = '';
    }
    close();
  };
  const render = () => {
    list?.remove();
    list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    list.id = `${control.id || 'cb'}-listbox`;
    for (const label of rowsFor()) {
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.textContent = label;
      if (!options.keyboardOnly) row.addEventListener('click', () => choose(label));
      list.append(row);
    }
    document.body.append(list);
    control.setAttribute('aria-controls', list.id);
    control.setAttribute('aria-expanded', 'true');
  };

  control.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'ArrowDown') {
      if (!list) return render();
      active = Math.min(active + 1, rowsFor().length - 1);
    }
    if (e.key === 'Enter' && list && active >= 0) choose(rowsFor()[active] ?? '');
  });
  if (control instanceof HTMLInputElement) {
    control.addEventListener('input', () => setTimeout(() => list && render(), 20));
    // an async autocomplete shows rows as you type, without being opened first
    if (typeof options.rows === 'function')
      control.addEventListener('input', () => setTimeout(() => !list && render(), 20));
  }
}
