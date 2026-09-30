import type { Cefr, FieldOption, PlanEntry, SalaryQuote } from '@applier/protocol';
import type { SiteAdapter } from '../adapters';
import { pickLevel } from './level-scale';
import { findDeclineOption, matchOption } from './match-option';
import { pickBand } from './ranges';
import { selectizeSet } from './selectize';
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
  m instanceof HTMLInputElement ? m.value : (m.getAttribute('value') ?? m.textContent ?? '');

const isChosen = (el: HTMLSelectElement, combobox: boolean): boolean =>
  el.value !== '' && (combobox || el.selectedIndex > 0);

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
      return left(control, 'handled by the CV step');
    case 'manual':
      // A box the site says must never be auto-ticked is a policy, not a question for the user.
      if (d.kind === 'checkbox-group' && adapter.neverTick?.test(d.label)) {
        return left(control, 'never auto-ticked on this site');
      }
      // An optional box nobody asked us to tick is not a question either.
      if (d.kind === 'checkbox-group' && !d.required && entry.reason !== 'below-floor') {
        return left(control, 'optional checkbox left unticked');
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
      return setChecked(box, true)
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
      if (!isEmpty(el)) return left(control, 'already filled');
      return setText(el as HTMLInputElement | HTMLTextAreaElement, value)
        ? filled(control)
        : failed(control, 'the page did not keep the value');
    }

    case 'select':
    case 'combobox':
    case 'radio-group': {
      // A choice the page (or a previous pass) already made is never overwritten.
      if (d.kind !== 'radio-group' && isChosen(el as HTMLSelectElement, d.kind === 'combobox'))
        return left(control, 'already chosen');
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
      return left(control, 'checkboxes follow the consent policy, not a text answer');

    default:
      return left(control, `cannot fill a ${d.kind}`);
  }
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
    return (await selectizeSet(el, d.id, optionValue))
      ? filled(control, detail)
      : failed(control, 'the combobox refused the option');
  }

  if (d.kind === 'radio-group') {
    const target = control.members.find((m) => optionKey(m) === optionValue);
    if (!target) return failed(control, `no radio for "${optionLabel}"`);
    if (control.members.some(isChecked)) return left(control, 'already chosen');
    return setChecked(target, true)
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
      if (d.kind !== 'radio-group' && isChosen(el as HTMLSelectElement, d.kind === 'combobox')) {
        return left(control, 'already chosen');
      }
      const band = pickBand(d.options ?? [], quote.amount);
      return band
        ? applyOption(control, band.value, band.label, said)
        : manualSalary(control, `${said} — none of the options holds it`);
    }

    default:
      return manualSalary(control, said);
  }
}

/** The profile's CEFR level -> the option on this form's own scale, shown so it is never silent. */
async function applyLevel(control: Control, cefr: Cefr): Promise<Outcome> {
  const { descriptor: d, el } = control;
  const options: readonly FieldOption[] = d.options ?? [];

  if (d.kind !== 'select' && d.kind !== 'combobox' && d.kind !== 'radio-group') {
    return { status: 'manual', id: d.id, label: d.label, reason: 'language-level', hint: cefr };
  }
  if (d.kind !== 'radio-group' && isChosen(el as HTMLSelectElement, d.kind === 'combobox')) {
    return left(control, 'already chosen');
  }
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
