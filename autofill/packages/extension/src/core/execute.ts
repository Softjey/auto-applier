import type { Cefr, FieldOption, PlanEntry, SalaryQuote } from '@applier/protocol';
import type { SiteAdapter } from '../adapters';
import { comboChoose, comboChosen, comboTypeahead, isListCombobox } from './combobox';
import { startDateFor } from './date-box';
import { pickLevel } from './level-scale';
import { findDeclineOption, matchOption } from './match-option';
import { pickBand } from './ranges';
import { selectizeSet } from './selectize';
import { clean } from './text';
import { isChecked, setChecked, setSelectValue, setText } from './setters';
import type { Control, Outcome } from './types';

const filled = (c: Control, detail?: string): Outcome => ({
  status: 'filled',
  id: c.descriptor.id,
  label: c.descriptor.label,
  ...(detail ? { detail } : {}),
});
const left = (c: Control, why: string): Outcome => ({
  status: 'left',
  id: c.descriptor.id,
  label: c.descriptor.label,
  why,
});
const failed = (c: Control, why: string): Outcome => ({
  status: 'failed',
  id: c.descriptor.id,
  label: c.descriptor.label,
  why,
});

/**
 * A native select's placeholder is its first option; a selectize combobox keeps
 * its options in memory, so its native <select> holds only the chosen one.
 */
/** The value a group member is identified by: an input's `value`, or an ARIA radio's `value` attribute. */
export const optionKey = (m: HTMLElement): string =>
  m instanceof HTMLInputElement ? m.value : (m.getAttribute('value') ?? clean(m.textContent));

const isChosen = (el: HTMLSelectElement, combobox: boolean): boolean =>
  el.value !== '' && (combobox || el.selectedIndex > 0);

/**
 * A choice the page (or a previous pass) already made is never overwritten. Radio groups check
 * their own members instead (see applyOption).
 */
const alreadyChosen = (c: Control): boolean => {
  const { descriptor: d, el } = c;
  if (d.kind === 'radio-group') return false;
  if (el instanceof HTMLSelectElement) return isChosen(el, d.kind === 'combobox');
  return isListCombobox(el) && comboChosen(el);
};

const isEmpty = (el: HTMLElement): boolean => {
  if (el instanceof HTMLSelectElement)
    return el.selectedIndex <= 0 && (el.value === '' || el.selectedIndex === 0);
  return ((el as HTMLInputElement).value ?? '') === '';
};

/**
 * Applies ONE plan entry to its control. Never submits, never fabricates: when
 * the plan's answer cannot be mapped onto the control (no matching option, a
 * value that would not stick) the control is reported, not forced. CV uploads
 * are handled by the runner, not here.
 */
export async function execute(
  control: Control,
  entry: PlanEntry,
  adapter: SiteAdapter,
): Promise<Outcome> {
  const { descriptor: d } = control;

  switch (entry.action) {
    case 'skip':
      return left(control, 'skipped');
    case 'leave':
      return left(control, 'policy: leave unchecked');
    case 'upload-cv':
      // Only a file control takes the CV; anything else that got here is a mislabelled field.
      return d.kind === 'file'
        ? left(control, 'handled by the CV step')
        : { status: 'manual', id: d.id, label: d.label, reason: 'unknown' };
    case 'manual':
      // A box the site says must never be auto-ticked is a policy, not a question for the user.
      if (d.kind === 'checkbox-group' && adapter.neverTick?.test(d.label)) {
        return left(control, 'never auto-ticked on this site');
      }
      // An optional box nobody asked us to tick is not a question either.
      if (d.kind === 'checkbox-group' && !d.required && entry.reason !== 'below-floor') {
        return left(control, 'optional checkbox left unticked');
      }
      // An optional free-text box (a message to the recruiter, a second website) with nothing
      // known for it stays empty: nothing is lost, and the standing policy is not to fill them.
      // A `review` one is different: the resolver has a candidate answer for the agent to judge.
      if (
        (d.kind === 'textarea' || d.kind === 'text' || d.kind === 'url') &&
        !d.required &&
        (entry.reason === 'narrative' || entry.reason === 'unknown')
      ) {
        return left(control, 'optional free text left empty');
      }
      return {
        status: 'manual',
        id: d.id,
        label: d.label,
        reason: entry.reason,
        ...(entry.hint ? { hint: entry.hint } : {}),
      };

    case 'salary':
      return applySalary(control, entry.quote);

    case 'language-level':
      return applyLevel(control, entry.cefr);

    case 'check': {
      if (d.kind !== 'checkbox-group' || control.members.length !== 1)
        return left(control, 'not a single consent box');
      if (!d.required) return left(control, 'optional consent stays unticked');
      if (adapter.neverTick?.test(d.label)) return left(control, 'never auto-ticked on this site');
      const box = control.members[0] as HTMLElement;
      return (await setChecked(box, true))
        ? filled(control)
        : failed(control, 'the box did not stay ticked');
    }

    case 'decline': {
      if (d.kind === 'radio-group' || d.kind === 'select' || d.kind === 'combobox') {
        const option = findDeclineOption(d.options ?? []);
        if (!option) return left(control, 'no "prefer not to say" option');
        return applyOption(control, option.value, option.label);
      }
      return left(control, 'voluntary question left blank');
    }

    case 'set':
      return applySet(control, entry.value);
  }
}

async function applySet(control: Control, value: string): Promise<Outcome> {
  const { descriptor: d, el } = control;

  switch (d.kind) {
    case 'text':
    case 'email':
    case 'tel':
    case 'url':
    case 'number':
    case 'textarea': {
      const box = el as HTMLInputElement | HTMLTextAreaElement;
      // A date box wants a date, not "2 weeks": today plus the duration, in the box's own format.
      const date = box instanceof HTMLInputElement ? startDateFor(box.placeholder, value) : null;
      const text = date ?? value;
      // A date picker that opens on today's date holds a default, not an answer.
      const isDefaultDate =
        date !== null && box.value === startDateFor(box.placeholder, 'immediately');
      if (!isEmpty(el) && !isDefaultDate) return left(control, 'already filled');
      return setText(box, text)
        ? filled(control, date ? `${value} -> ${date}` : undefined)
        : failed(control, 'the page did not keep the value');
    }

    case 'select':
    case 'combobox':
    case 'radio-group': {
      if (el instanceof HTMLSelectElement && el.multiple) {
        // Selectize keeps its own state: set through its API, not on the hidden <select>.
        return d.kind === 'combobox'
          ? applySelectizeMulti(control, value)
          : applyMultiSelect(control, value);
      }
      if (alreadyChosen(control)) return left(control, 'already chosen');
      // An autocomplete that shows rows only once you type (a location box).
      if (d.kind === 'combobox' && d.optionsHidden && isListCombobox(el)) {
        const found = await comboTypeahead(el, value);
        if (found.ok) return filled(control);
        return {
          status: 'manual',
          id: d.id,
          label: d.label,
          reason: 'no option matches the profile answer',
          hint: `${value.slice(0, 80)} — the list offered: ${found.seen.join(' | ') || 'nothing'}`,
        };
      }
      const option = matchOption(d.options ?? [], value);
      if (!option) {
        return {
          status: 'manual',
          id: d.id,
          label: d.label,
          reason: 'no option matches the profile answer',
          hint: value.slice(0, 120),
        };
      }
      return applyOption(control, option.value, option.label);
    }

    case 'checkbox-group':
      return applyChoices(control, value);

    default:
      return left(control, `cannot fill a ${d.kind}`);
  }
}

/** "React, Next.js" -> the options each part names; a part that names none is reported, not guessed. */
const LIST_ITEM_MAX = 40;

function pickMany(options: readonly FieldOption[], value: string) {
  const picked: FieldOption[] = [];
  const missing: string[] = [];
  const parts = value
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  // A list is short items ("React, Next.js"); a long piece means a sentence ("B2B — the anchor
  // is …; open to UoP"), which is one answer and is matched whole.
  for (const part of parts.some((p) => p.length > LIST_ITEM_MAX) ? [value.trim()] : parts) {
    const hit = matchOption(options, part);
    if (hit) picked.push(hit);
    else missing.push(part);
  }
  return { picked, missing };
}

const partial = (c: Control, missing: string[]): Outcome => ({
  status: 'manual',
  id: c.descriptor.id,
  label: c.descriptor.label,
  reason: 'no option matches the profile answer',
  hint: missing.join(', ').slice(0, 120),
});

/** A multiple choice: tick what the answer names, never untick what is already on. */
async function applyChoices(control: Control, value: string): Promise<Outcome> {
  const { picked, missing } = pickMany(control.descriptor.options ?? [], value);
  if (control.members.length < 2 || picked.length === 0) {
    return left(control, 'checkboxes follow the consent policy, not a text answer');
  }
  for (const option of picked) {
    // Options were built in member order; a button's own text is empty, its label sits beside it.
    const box = control.members[(control.descriptor.options ?? []).indexOf(option)];
    if (!box || !(await setChecked(box, true)))
      return failed(control, `"${option.label}" did not stay ticked`);
  }
  return missing.length > 0
    ? partial(control, missing)
    : filled(control, picked.map((o) => o.label).join(', '));
}

/** A selectize multi-select: add every option the answer names through the page-world bridge. */
async function applySelectizeMulti(control: Control, value: string): Promise<Outcome> {
  const { picked, missing } = pickMany(control.descriptor.options ?? [], value);
  if (picked.length === 0) return partial(control, missing.length ? missing : [value]);
  for (const option of picked) {
    if (!(await selectizeSet(control.el, control.descriptor.id, option.value, true))) {
      return failed(control, `"${option.label}" was refused by the list`);
    }
  }
  const shown = picked.map((o) => o.label).join(', ');
  return missing.length > 0 ? partial(control, missing) : filled(control, shown);
}

/** <select multiple>: select every option the answer names, keep what is already selected. */
async function applyMultiSelect(control: Control, value: string): Promise<Outcome> {
  const select = control.el as HTMLSelectElement;
  const { picked, missing } = pickMany(control.descriptor.options ?? [], value);
  if (picked.length === 0) return partial(control, missing.length ? missing : [value]);
  for (const o of select.options) if (picked.some((p) => p.value === o.value)) o.selected = true;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const ok = picked.every((p) => [...select.selectedOptions].some((o) => o.value === p.value));
  if (!ok) return failed(control, 'the page did not keep the selection');
  return missing.length > 0
    ? partial(control, missing)
    : filled(control, picked.map((o) => o.label).join(', '));
}

async function applyOption(
  control: Control,
  optionValue: string,
  optionLabel: string,
  detail?: string,
): Promise<Outcome> {
  const { descriptor: d, el } = control;

  if (d.kind === 'select') {
    const select = el as HTMLSelectElement;
    if (select.value !== '' && select.selectedIndex > 0) return left(control, 'already chosen');
    return setSelectValue(select, optionValue)
      ? filled(control, detail)
      : failed(control, 'the option did not stick');
  }

  if (d.kind === 'combobox') {
    const taken = isListCombobox(el)
      ? await comboChoose(el, optionLabel)
      : await selectizeSet(el, d.id, optionValue);
    return taken ? filled(control, detail) : failed(control, 'the combobox refused the option');
  }

  if (d.kind === 'radio-group') {
    const target = control.members.find((m) => optionKey(m) === optionValue);
    if (!target) return failed(control, `no radio for "${optionLabel}"`);
    if (control.members.some(isChecked)) return left(control, 'already chosen');
    return (await setChecked(target, true))
      ? filled(control, detail)
      : failed(control, 'the radio did not stick');
  }

  return left(control, `cannot choose an option on a ${d.kind}`);
}

const grouped = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** How a person types money into a box: "30 000 PLN"; a numeric box gets the bare digits. */
function moneyText(quote: SalaryQuote, numeric: boolean): string {
  return numeric
    ? String(Math.round(quote.amount))
    : `${grouped(quote.amount)} ${quote.unit.currency}`;
}

const manualSalary = (c: Control, hint: string): Outcome => ({
  status: 'manual',
  id: c.descriptor.id,
  label: c.descriptor.label,
  reason: 'salary',
  hint,
});

/**
 * The figure comes from salary-quote.mjs for THIS vacancy. A field of ranges ("26 000 -
 * 28 000 zł") gets the band that holds it; a box gets the figure itself. Anything else is
 * handed back with the number, never filled by guesswork.
 */
async function applySalary(control: Control, quote: SalaryQuote): Promise<Outcome> {
  const { descriptor: d, el } = control;
  const said = `${grouped(quote.amount)} ${quote.unit.currency}/${quote.unit.period} — ${quote.note}`;

  switch (d.kind) {
    case 'text':
    case 'textarea':
    case 'number': {
      if (!isEmpty(el)) return left(control, 'already filled');
      return setText(
        el as HTMLInputElement | HTMLTextAreaElement,
        moneyText(quote, d.kind === 'number'),
      )
        ? filled(control, said)
        : failed(control, 'the page did not keep the value');
    }

    case 'select':
    case 'combobox':
    case 'radio-group': {
      if (alreadyChosen(control)) return left(control, 'already chosen');
      const band = pickBand(d.options ?? [], quote.amount);
      return band
        ? applyOption(control, band.value, band.label, said)
        : manualSalary(control, `${said} — none of the options holds it`);
    }

    default:
      return manualSalary(control, said);
  }
}

const NAMES_CEFR = /\b[ABC][12]\b.*\b[ABC][12]\b/;

/** The profile's CEFR level -> the option on this form's own scale, shown so it is never silent. */
async function applyLevel(control: Control, cefr: Cefr): Promise<Outcome> {
  const { descriptor: d } = control;
  const options: readonly FieldOption[] = d.options ?? [];

  // A text box whose question lists the CEFR codes ("Native, C2, C1, B2 …") takes the code itself.
  if ((d.kind === 'text' || d.kind === 'textarea') && NAMES_CEFR.test(d.label)) {
    if (!isEmpty(control.el)) return left(control, 'already filled');
    return setText(control.el as HTMLInputElement | HTMLTextAreaElement, cefr)
      ? filled(control, `${cefr} (the form lists CEFR codes)`)
      : failed(control, 'the page did not keep the value');
  }
  if (d.kind !== 'select' && d.kind !== 'combobox' && d.kind !== 'radio-group') {
    return { status: 'manual', id: d.id, label: d.label, reason: 'language-level', hint: cefr };
  }
  if (alreadyChosen(control)) return left(control, 'already chosen');
  const pick = pickLevel(options, cefr);
  if (!pick)
    return { status: 'manual', id: d.id, label: d.label, reason: 'language-level', hint: cefr };
  const position = options.findIndex((o) => o.value === pick.value) + 1;
  return applyOption(
    control,
    pick.value,
    pick.label,
    `${cefr} -> "${pick.label}" (step ${position} of ${options.length})`,
  );
}
