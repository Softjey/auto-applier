import { beforeEach, describe, expect, it } from 'vitest';
import { erecruiter } from '../src/adapters/erecruiter';
import { fillForm } from '../src/core/run';
import { fakeBackend, when } from './helpers';

beforeEach(() => {
  document.body.innerHTML = '';
});

const select = (options: string[]) =>
  `<form><div class="form-group"><label for="s">When can you start? *</label>
   <select id="s" name="s"><option value="">Choose</option>${options.map((o) => `<option>${o}</option>`).join('')}</select></div></form>`;
const twoWeeks = when(/start/i, () => ({ action: 'set', value: '2 weeks', source: 't' }));

describe('a start date list with no option for the notice period', () => {
  it('takes the single immediate option, and says so', async () => {
    document.body.innerHTML = select([
      'od zaraz',
      'od początku miesiąca',
      '1 miesiąc wypowiedzenia',
    ]);
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([twoWeeks]),
      doc: document,
      cvId: null,
    });
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('od zaraz');
    const note = report.outcomes.find((o) => o.status === 'filled');
    expect(note && 'detail' in note ? note.detail : '').toMatch(/earliest available/);
  });

  it('prefers a list option that names the period, and never guesses without an immediate one', async () => {
    document.body.innerHTML = select(['1 tydzień', '2 tygodnie', '1 miesiąc']);
    await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([twoWeeks]),
      doc: document,
      cvId: null,
    });
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('2 tygodnie');

    document.body.innerHTML = select(['1 miesiąc', '3 miesiące']);
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([twoWeeks]),
      doc: document,
      cvId: null,
    });
    expect((document.getElementById('s') as HTMLSelectElement).value).toBe('');
    expect(report.manual).toHaveLength(1);
  });
});

describe('a manual list that already shows an answer', () => {
  it('says which in the hint', async () => {
    document.body.innerHTML = `<form><div class="form-group"><label for="c">Currency / type</label>
      <select id="c" name="c"><option value="">Choose</option><option selected>PLN net</option><option>EUR</option></select></div></form>`;
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([when(/Currency/, () => ({ action: 'manual', reason: 'review' }))]),
      doc: document,
      cvId: null,
    });
    expect(report.manual[0]?.hint).toBe('now: PLN net');
  });
});
