import type { PlanEntry } from '@applier/protocol';
import type { SiteAdapter } from '../adapters';
import { findDeclineOption, matchOption } from './match-option';
import { selectizeSet } from './selectize';
import { setChecked, setSelectValue, setText } from './setters';
import type { Control, Outcome } from './types';

const filled = (c: Control): Outcome => ({
  status: 'filled',
  id: c.descriptor.id,
  label: c.descriptor.label,
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
      return {
        status: 'manual',
        id: d.id,
        label: d.label,
        reason: entry.reason,
        ...(entry.hint ? { hint: entry.hint } : {}),
      };

    case 'check': {
      if (adapter.leaveCheckboxes) return left(control, 'checkboxes are left to you on this site');
      if (d.kind !== 'checkbox-group' || control.members.length !== 1)
        return left(control, 'not a single consent box');
      if (!d.required) return left(control, 'optional consent stays unticked');
      if (adapter.neverTick?.test(d.label)) return left(control, 'never auto-ticked on this site');
      const box = control.members[0] as HTMLInputElement;
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

    default:
      return left(control, `cannot fill a ${d.kind}`);
  }
}

async function applyOption(
  control: Control,
  optionValue: string,
  optionLabel: string,
): Promise<Outcome> {
  const { descriptor: d, el } = control;

  if (d.kind === 'select') {
    const select = el as HTMLSelectElement;
    if (select.value !== '' && select.selectedIndex > 0) return left(control, 'already chosen');
    return setSelectValue(select, optionValue)
      ? filled(control)
      : failed(control, 'the option did not stick');
  }

  if (d.kind === 'combobox') {
    return (await selectizeSet(el, d.id, optionValue))
      ? filled(control)
      : failed(control, 'the combobox refused the option');
  }

  if (d.kind === 'radio-group') {
    const target = control.members.find((m) => m.value === optionValue);
    if (!target) return failed(control, `no radio for "${optionLabel}"`);
    if (control.members.some((m) => m.checked)) return left(control, 'already chosen');
    return setChecked(target, true) ? filled(control) : failed(control, 'the radio did not stick');
  }

  return left(control, `cannot choose an option on a ${d.kind}`);
}
