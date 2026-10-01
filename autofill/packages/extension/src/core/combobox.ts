import type { FieldOption } from '@applier/protocol';
import { rootOf } from './deep';
import { matchOption } from './match-option';
import { sleep } from './sleep';
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
const CLOSE_WAIT_MS = 300;
const KEY_GAP_MS = 40;
const SUGGEST_SETTLE_MS = 350;

export type ListCombobox = HTMLElement;

/**
 * A `role=combobox` control: an input (react-select, autocompletes), a button (Radix Select) or
 * another element (Angular Material's <mat-select>).
 */
export const isListCombobox = (el: Element): boolean =>
  el instanceof HTMLElement && (el.getAttribute('role') === 'combobox' || isPopoverSelect(el));

/**
 * A plain button that opens a popover holding a listbox and carries no combobox role (the new
 * eRecruiter's "Wybierz" country and start-date lists). It is a field only if the list it
 * opens has rows: a date picker opens a dialog too.
 */
export const isPopoverSelect = (el: Element): el is HTMLButtonElement =>
  el instanceof HTMLButtonElement &&
  el.getAttribute('role') !== 'combobox' &&
  /^(dialog|listbox)$/.test(el.getAttribute('aria-haspopup') ?? '');

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
  // A popover's list is mounted only once it is open: until then there are no rows, and
  // another popover's rows left on the page must not be taken for them.
  const mine = owned
    ? (rootOf(el).getElementById(owned) ?? el.ownerDocument.getElementById(owned))
    : null;
  if (isPopoverSelect(el) && owned && !mine) return [];
  // Overlays (Material, Radix) render in <body>, outside the control's own shadow root.
  const scope: ParentNode =
    (owned ? (rootOf(el).getElementById(owned) ?? el.ownerDocument.getElementById(owned)) : null) ??
    el.ownerDocument;
  // With no listbox of its own to look in, the whole page is searched; rows that belong to a
  // DIFFERENT control's listbox (a list left open elsewhere) are not this control's options.
  const foreign = owned
    ? new Set<string>()
    : new Set(
        [...el.ownerDocument.querySelectorAll('[aria-controls][role="combobox"]')]
          .filter((c) => c !== el)
          .map((c) => c.getAttribute('aria-controls') ?? ''),
      );
  return [...scope.querySelectorAll<HTMLElement>('[role="option"]')].filter(
    (o) =>
      isVisible(o, false) &&
      clean(o.textContent) !== '' &&
      !foreign.has(o.closest('[role="listbox"]')?.id ?? '\0'),
  );
}

async function waitForOptions(el: ListCombobox, ms: number): Promise<HTMLElement[]> {
  // By the clock, not by counting polls: a background tab runs a 25 ms timer once a second.
  const deadline = performance.now() + ms;
  for (;;) {
    const rows = visibleOptions(el);
    if (rows.length > 0 || performance.now() >= deadline) return rows;
    await sleep(POLL_MS);
  }
}

async function open(el: ListCombobox): Promise<HTMLElement[]> {
  el.focus();
  // A popover button answers a click, not the arrow key; only a closed one needs it.
  if (isPopoverSelect(el)) {
    if (el.getAttribute('aria-expanded') !== 'true') click(el);
  } else press(el, 'ArrowDown');
  return waitForOptions(el, OPEN_WAIT_MS);
}

async function close(el: ListCombobox): Promise<void> {
  press(el, 'Escape');
  await sleep(POLL_MS);
  // `aria-expanded` follows the key a moment later; acting before that would reopen a list that
  // is already closing. One still open after the page has had time to react is shut by hand, so
  // its rows cannot leak into the next list.
  const deadline = performance.now() + CLOSE_WAIT_MS;
  while (performance.now() < deadline) {
    if (el.getAttribute('aria-expanded') !== 'true') return;
    await sleep(POLL_MS);
  }
  if (isPopoverSelect(el))
    click(el); // a toggle
  else el.blur(); // react-select shuts its menu when it loses focus
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
  if (took(el, wanted)) {
    // A pick may leave its list open (a popover, a phone-country selector) over the next field.
    if (el.getAttribute('aria-expanded') === 'true') await close(el);
    return true;
  }

  // Some libraries only take a row from the keyboard: walk down to it and press Enter.
  await open(el);
  for (let i = 0; i <= index; i++) press(el, 'ArrowDown');
  press(el, 'Enter');
  await sleep(SETTLE_MS);
  const ok = took(el, wanted);
  if (!ok) await close(el);
  return ok;
}

/**
 * A pick took when the control now holds an answer AND either shows the row's words or has shut
 * its list. A phone-country selector shows only a flag and "+48" for the row "Poland +48", so the
 * words alone cannot be the test.
 */
const took = (el: ListCombobox, wanted: string): boolean =>
  comboChosen(el) && (shown(el).includes(wanted) || el.getAttribute('aria-expanded') !== 'true');

function typeInto(el: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  el.focus();
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
}

/**
 * One key at a time — keydown, an `insertText` InputEvent, keyup — with a short gap. Location
 * autocompletes (Greenhouse's Places search) ignore a value set in one go and answer only to
 * typing; a person's keystrokes are exactly what they listen for.
 */
async function typeLikeAPerson(el: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  el.focus();
  let typed = '';
  for (const ch of text) {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
    typed += ch;
    if (setter) setter.call(el, typed);
    else el.value = typed;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
    await sleep(KEY_GAP_MS);
  }
}

/**
 * Every word of the answer ("Warsaw, Poland (mazowieckie).") appears in the row's label
 * ("Warsaw, Mazowieckie, Poland"), in any order. Used only to find ONE row among an
 * autocomplete's suggestions, never to settle for a near miss.
 */
const holdsAllParts = (row: string, answer: string): boolean => {
  const words = normalize(answer)
    .split(/\s+/)
    .filter((w) => w.length > 1);
  const text = ` ${normalize(row)} `;
  return words.length > 0 && words.every((w) => text.includes(` ${w}`));
};

/**
 * For an autocomplete that offers no options until you type (a location box): type the answer,
 * wait for the suggestions, and pick the one row that is unambiguously it. Two "Warsaw"s (one
 * in Poland, one in Indiana) is a refusal, not a coin toss: the typed text is cleared and the
 * field is handed back.
 */
export async function comboTypeahead(
  el: ListCombobox,
  answer: string,
): Promise<{ ok: boolean; seen: string[] }> {
  if (!(el instanceof HTMLInputElement)) return { ok: false, seen: [] };
  // Search by the first part only ("Warsaw"): an autocomplete rarely finds "Warsaw, Poland"
  // as typed, and the remaining parts are what pick the one row among its suggestions.
  await typeLikeAPerson(el, answer.split(',')[0]?.trim() || answer);
  const first = await waitForOptions(el, TYPEAHEAD_WAIT_MS);
  // The first suggestions are often a partial answer that the next keystroke's response replaces.
  const rows = first.length > 0 ? (await sleep(SUGGEST_SETTLE_MS), visibleOptions(el)) : first;
  const options = rows.map((r) => ({ value: labelOf(r), label: labelOf(r) }));

  const exact = matchOption(options, answer);
  const partial = options.filter((o) => holdsAllParts(o.label, answer));
  const pick = exact ?? (partial.length === 1 ? partial[0] : undefined);

  const seen = options.slice(0, 4).map((o) => o.label);
  if (!pick) {
    typeInto(el, '');
    await close(el);
    return { ok: false, seen };
  }
  return { ok: await comboChoose(el, pick.label), seen };
}
