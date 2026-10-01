import { beforeEach, describe, expect, it } from 'vitest';
import { greenhouse } from '../src/adapters/greenhouse';
import { fillForm } from '../src/core/run';
import { fakeBackend, mountFakeCombobox, when } from './helpers';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a list left open by another control', () => {
  it("is not mistaken for an autocomplete's own options", async () => {
    document.body.innerHTML = `<form>
      <div class="form-group"><label for="country">Country</label>
        <div class="select__control"><input id="country" role="combobox" aria-controls="country-lb" aria-expanded="true"></div></div>
      <div class="form-group"><label for="candidate-location">Location (City)*</label>
        <div class="select__control"><input id="candidate-location" role="combobox"></div></div></form>`;
    // the phone-country list stays open, as it does on the live form
    const stale = document.createElement('div');
    stale.id = 'country-lb';
    stale.setAttribute('role', 'listbox');
    for (const label of ['Afghanistan +93', 'Poland +48']) {
      const row = document.createElement('div');
      row.setAttribute('role', 'option');
      row.textContent = label;
      stale.append(row);
    }
    document.body.append(stale);
    // an async autocomplete: rows only once something is typed
    mountFakeCombobox(document.getElementById('candidate-location') as HTMLInputElement, {
      rows: (typed) =>
        typed.startsWith('Warsaw')
          ? ['Warsaw, Indiana, United States', 'Warsaw, Mazowieckie, Poland']
          : [],
    });
    const backend = fakeBackend([
      when(/^Location/, () => ({
        action: 'set',
        value: 'Warsaw, Poland (mazowieckie).',
        source: 't',
      })),
    ]);
    await fillForm({ adapter: greenhouse, backend, doc: document, cvId: null });

    const location = backend.asked.find((f) => /^Location/.test(f.label));
    expect(location?.options).toBeUndefined(); // not the 244 country rows
    expect(location?.optionsHidden).toBe(true);
    expect(document.querySelector('.select__single-value')?.textContent).toBe(
      'Warsaw, Mazowieckie, Poland',
    );
  });
});
