import { beforeEach, describe, expect, it } from 'vitest';
import { erecruiter } from '../src/adapters/erecruiter';
import { fillForm } from '../src/core/run';
import { fakeBackend, when } from './helpers';

const value = (v: string) => () => ({ action: 'set' as const, value: v, source: 'test' });

beforeEach(() => {
  document.body.innerHTML = '';
});

/** The new eRecruiter's "Wybierz" lists: a plain button that opens a dialog holding a listbox. */
function mountPopoverSelect(button: HTMLButtonElement, rows: string[]): void {
  let dialog: HTMLElement | null = null;
  const close = () => {
    dialog?.remove();
    dialog = null;
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  button.addEventListener('click', () => {
    if (dialog) return close();
    dialog = document.createElement('div');
    dialog.id = button.getAttribute('aria-controls') ?? '';
    dialog.setAttribute('role', 'dialog');
    const list = document.createElement('ul');
    list.setAttribute('role', 'listbox');
    for (const label of rows) {
      const row = document.createElement('li');
      row.setAttribute('role', 'option');
      row.textContent = label;
      row.addEventListener('click', () => {
        button.textContent = label;
        close();
      });
      list.append(row);
    }
    dialog.append(list);
    document.body.append(dialog);
    button.setAttribute('aria-expanded', 'true');
  });
}

describe('popover selects (a button with aria-haspopup, no combobox role)', () => {
  const load = () => {
    document.body.innerHTML = `<form>
      <div><label for="c">Kraj</label>
        <button type="button" id="c" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop-c">Wybierz</button></div>
      <div><label for="s">W jakim terminie może Pan/ Pani rozpocząć pracę? *</label>
        <button type="button" id="s" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop-s">Wybierz</button></div>
      <div><label for="d">Data</label>
        <button type="button" id="d" aria-haspopup="dialog" aria-expanded="false" aria-controls="pop-d">Pick a date</button></div>
    </form>`;
    mountPopoverSelect(document.getElementById('c') as HTMLButtonElement, ['Polska', 'Albania']);
    mountPopoverSelect(document.getElementById('s') as HTMLButtonElement, [
      'Natychmiast',
      '2 tygodnie',
      '1 miesiąc',
    ]);
    // A date picker opens a dialog with no listbox rows: not a select.
    document.getElementById('d')?.addEventListener('click', () => undefined);
  };
  const text = (id: string) => document.getElementById(id)?.textContent;

  it('opens the list with a click and picks the option the answer names', async () => {
    load();
    const backend = fakeBackend([
      when(/^Kraj/, value('Poland')),
      when(/terminie/i, value('2 weeks')),
    ]);
    await fillForm({ adapter: erecruiter, backend, doc: document, cvId: null });
    expect(text('c')).toBe('Polska');
    expect(text('s')).toBe('2 tygodnie');
  });

  it('does not list a popover button with no rows as a question', async () => {
    load();
    const backend = fakeBackend([]);
    await fillForm({ adapter: erecruiter, backend, doc: document, cvId: null });
    expect(backend.asked.map((f) => f.label)).not.toContain('Data');
    expect(text('d')).toBe('Pick a date');
  });
});
