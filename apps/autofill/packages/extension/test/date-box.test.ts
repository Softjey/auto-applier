import { beforeEach, describe, expect, it } from 'vitest';
import { traffit } from '../src/adapters/traffit';
import { dateFormat, startDateFor } from '../src/core/date-box';
import { fillForm } from '../src/core/run';
import { fakeBackend, when } from './helpers';

const today = new Date(2026, 9, 1); // 1 Oct 2026

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('startDateFor', () => {
  it('writes today plus the duration in the format the box announces', () => {
    expect(startDateFor('YYYY/MM/DD', '2 weeks', today)).toBe('2026/10/15');
    expect(startDateFor('DD.MM.YYYY', '2 tygodnie', today)).toBe('15.10.2026');
    expect(startDateFor('YYYY-MM-DD', 'immediately', today)).toBe('2026-10-01');
    expect(startDateFor('YYYY/MM/DD', '1 month', today)).toBe('2026/10/31');
  });

  it('does nothing for a box with no date format, or an answer that is not a duration', () => {
    expect(dateFormat('Wpisz')).toBeNull();
    expect(startDateFor('Wpisz', '2 weeks', today)).toBeNull();
    expect(startDateFor('YYYY/MM/DD', 'Warsaw', today)).toBeNull();
  });
});

describe('a date box', () => {
  it('takes the start date, replacing the default a picker opens on', async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayText = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())}`;
    document.body.innerHTML = `<form><div class="form-group"><label for="d">Kiedy możesz zacząć pracować? *</label>
      <input id="d" name="d" placeholder="YYYY/MM/DD" value="${todayText}"></div></form>`;
    const backend = fakeBackend([
      when(/zacząć/, () => ({ action: 'set', value: '2 weeks', source: 'test' })),
    ]);
    const report = await fillForm({ adapter: traffit, backend, doc: document, cvId: null });
    const expected = startDateFor('YYYY/MM/DD', '2 weeks');
    expect((document.getElementById('d') as HTMLInputElement).value).toBe(expected);
    expect(report.manual).toEqual([]);
  });
});
