import type { FieldOption } from '@applier/protocol';
import { rootOf } from './deep';
import { matchOption } from './match-option';
import { clean, normalize } from './text';
import { isVisible } from './visibility';

/**
 * Custom dropdowns that are not a native <select>: react-select (Greenhouse), Radix / shadcn
 * Select (the new eRecruiter), async location autocompletes. They share one ARIA contract —
 * a `role="combobox"` control that, once opened, shows `role="option"` rows — so one driver
 * serves them all. Nothing is assigned programmatically: a person opens the list, picks a
 * row, and that is exactly what happens here (assigning a value does nothing on these).
 */
const POLL_MS = 25;
const OPEN_WAIT_MS = 700;
const TYPEAHEAD_WAIT_MS = 3000;
const SETTLE_MS = 400;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ListCombobox = HTMLElement;

/**
 * A `role=combobox` control: an input (react-select, autocompletes), a button (Radix Select) or
 * another element (Angular Material's <mat-select>).
 */
export const isListCombobox = (el: Element): boolean =>
  el instanceof HTMLElement && el.getAttribute('role') === 'combobox';

function press(el: HTMLElement, key: string): void {
  for (const type of ['keydown', 'keyup']) {
    el.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
  }
}

/** pointerdown -> mousedown -> pointerup -> mouseup -> click: what a mouse produces. */
function click(el: HTMLElement): void {
  const Pointer = el.ownerDocument.defaultView?.PointerEvent ?? MouseEvent;
  for (const [Ctor, type] of [
    [Pointer, 'pointerdown'],
    [MouseEvent, 'mousedown'],
    [Pointer, 'pointerup'],
    [MouseEvent, 'mouseup'],
    [MouseEvent, 'click'],
  ] as const) {
    el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }));
  }
}

/** The rows currently offered: the listbox this control owns, else any visible option on the page. */
function visibleOptions(el: ListCombobox): HTMLElement[] {
  const owned = el.getAttribute('aria-controls') ?? el.getAttribute('aria-owns');
  // Overlays (Material, Radix) render in <body>, outside the control's own shadow root.
  const scope: ParentNode =
    (owned ? (rootOf(el).getElementById(owned) ?? el.ownerDocument.getElementById(owned)) : null) ??
    el.ownerDocument;
  return [...scope.querySelectorAll<HTMLElement>('[role="option"]')].filter(
    (o) => isVisible(o, false) && clean(o.textContent) !== '',
  );
}

async function waitForOptions(el: ListCombobox, ms: number): Promise<HTMLElement[]> {
  for (let waited = 0; ; waited += POLL_MS) {
    const rows = visibleOptions(el);
    if (rows.length > 0 || waited >= ms) return rows;
    await sleep(POLL_MS);
  }
}

async function open(el: ListCombobox): Promise<HTMLElement[]> {
  el.focus();
  press(el, 'ArrowDown');
  return waitForOptions(el, OPEN_WAIT_MS);
}

async function close(el: ListCombobox): Promise<void> {
  press(el, 'Escape');
  await sleep(POLL_MS);
}

const labelOf = (row: HTMLElement): string => clean(row.textContent);

/** The options behind a control, read by opening it. Empty for an async autocomplete. */
export async function comboOptions(el: ListCombobox): Promise<FieldOption[]> {
  const rows = await open(el);
  const options = rows.map((r) => ({ value: labelOf(r), label: labelOf(r) }));
  await close(el);
  return options;
}

/** react-select's answer nodes: `css-<hash>-singleValue`, or `<prefix>__single-value` with a classNamePrefix. */
const VALUE_NODE =
  '[class*="singleValue"], [class*="single-value"], [class*="multiValue"], [class*="multi-value"]';

const PLACEHOLDER = /^(select|choose|wybierz|please select|\.\.\.|—|-)\W*$/i;

/** Whether the control already shows an answer (never overwrite one the page or a person set). */
export function comboChosen(el: ListCombobox): boolean {
  if (el.matches('mat-select, .mat-mdc-select, .mat-select')) {
    return el.querySelector('.mat-mdc-select-placeholder, .mat-select-placeholder') === null;
  }
  if (!(el instanceof HTMLInputElement)) {
    return !el.hasAttribute('data-placeholder') && !PLACEHOLDER.test(clean(el.textContent));
  }
  // An autocomplete that takes its pick into the input itself (Angular Material).
  if (el.value !== '') return true;
  // react-select keeps the search text in the input, and the answer in a sibling node.
  const box = el.closest('[class*="control"]') ?? el.parentElement?.parentElement;
  return box?.querySelector(VALUE_NODE) != null;
}

/** What the control displays now, for checking a pick took. */
function shown(el: ListCombobox): string {
  if (el instanceof HTMLInputElement) {
    const box = el.closest('[class*="control"]') ?? el.parentElement?.parentElement ?? el;
    return normalize(`${clean(box.textContent)} ${el.value}`);
  }
  return normalize(clean(el.textContent));
}

/** Opens the list and picks the row labelled `label`; checks that the control now shows it. */
export async function comboChoose(el: ListCombobox, label: string): Promise<boolean> {
  const wanted = normalize(label);
  const rows = await open(el);
  const index = rows.findIndex((r) => normalize(labelOf(r)) === wanted);
  const row = rows[index];
  if (!row) {
    await close(el);
    return false;
  }

  click(row);
  await sleep(SETTLE_MS);
  if (shown(el).includes(wanted) && comboChosen(el)) return true;

  // Some libraries only take a row from the keyboard: walk down to it and press Enter.
  await open(el);
  for (let i = 0; i <= index; i++) press(el, 'ArrowDown');
  press(el, 'Enter');
  await sleep(SETTLE_MS);
  const ok = shown(el).includes(wanted) && comboChosen(el);
  if (!ok) await close(el);
  return ok;
}

function typeInto(el: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  el.focus();
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
}

/**
 * Every comma-separated part of the answer ("Warsaw, Poland") appears in the row's label
 * ("Warsaw, Masovian Voivodeship, Poland"). Used only to find ONE row among an
 * autocomplete's suggestions, never to settle for a near miss.
 */
const holdsAllParts = (row: string, answer: string): boolean => {
  const parts = answer.split(',').map(normalize).filter(Boolean);
  const text = normalize(row);
  return parts.length > 0 && parts.every((p) => text.includes(p));
};

/**
 * For an autocomplete that offers no options until you type (a location box): type the answer,
 * wait for the suggestions, and pick the one row that is unambiguously it. Two "Warsaw"s (one
 * in Poland, one in Indiana) is a refusal, not a coin toss: the typed text is cleared and the
 * field is handed back.
 */
export async function comboTypeahead(el: ListCombobox, answer: string): Promise<boolean> {
  if (!(el instanceof HTMLInputElement)) return false;
  typeInto(el, answer);
  const rows = await waitForOptions(el, TYPEAHEAD_WAIT_MS);
  const options = rows.map((r) => ({ value: labelOf(r), label: labelOf(r) }));

  const exact = matchOption(options, answer);
  const partial = options.filter((o) => holdsAllParts(o.label, answer));
  const pick = exact ?? (partial.length === 1 ? partial[0] : undefined);

  if (!pick) {
    typeInto(el, '');
    await close(el);
    return false;
  }
  return comboChoose(el, pick.label);
}
