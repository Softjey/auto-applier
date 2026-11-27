import { describe, expect, it } from 'vitest';
import { durationDays } from '../src/core/duration';
import { pickLevel } from '../src/core/level-scale';
import { matchOption } from '../src/core/match-option';
import { parseRange, pickBand } from '../src/core/ranges';

const opts = (...labels: string[]) => labels.map((l, i) => ({ value: String(i), label: l }));

describe('parseRange', () => {
  it.each([
    ['26 000 - 28 000 zł', { lo: 26000, hi: 28000 }],
    ['6.000–8.000 PLN', { lo: 6000, hi: 8000 }],
    ['poniżej 6 000 zł', { hi: 6000 }],
    ['powyżej 34 000 zł', { lo: 34000 }],
    ['up to 12k', { hi: 12000 }],
    ['20k+', { lo: 20000 }],
  ])('%s', (label, range) => {
    expect(parseRange(label)).toEqual(range);
  });

  it('is null for a label without a number', () => {
    expect(parseRange('Brak doświadczenia')).toBeNull();
  });
});

describe('pickBand', () => {
  const bands = opts(
    'poniżej 26 000 zł',
    '26 000 - 28 000 zł',
    '28 000 - 30 000 zł',
    '30 000 - 32 000 zł',
    'powyżej 32 000 zł',
  );

  it('picks the band that holds the figure', () => {
    expect(pickBand(bands, 27000)?.label).toBe('26 000 - 28 000 zł');
    expect(pickBand(bands, 20000)?.label).toBe('poniżej 26 000 zł');
    expect(pickBand(bands, 40000)?.label).toBe('powyżej 32 000 zł');
  });

  it('puts a boundary figure in the HIGHER band: never quote under the baseline', () => {
    expect(pickBand(bands, 30000)?.label).toBe('30 000 - 32 000 zł');
  });

  it('is not a band question when fewer than two options are ranges', () => {
    expect(pickBand(opts('Tak', 'Nie', '5 lat'), 30000)).toBeUndefined();
  });
});

describe('durationDays / availability', () => {
  it('reads the same answer in two languages', () => {
    expect(durationDays('2 weeks')).toBe(14);
    expect(durationDays('2 tygodnie')).toBe(14);
    expect(durationDays('1 miesiąc')).toBe(30);
    expect(durationDays('30 dni')).toBe(30);
    expect(durationDays('Natychmiast')).toBe(0);
    expect(durationDays('Yes')).toBeNull();
  });

  it('matches a profile notice period to a Polish option', () => {
    expect(matchOption(opts('Natychmiast', '2 tygodnie', '1 miesiąc'), '2 weeks')?.label).toBe(
      '2 tygodnie',
    );
    expect(matchOption(opts('Natychmiast', '2 tygodnie', '1 miesiąc'), 'immediately')?.label).toBe(
      'Natychmiast',
    );
    expect(matchOption(opts('Natychmiast', '2 tygodnie'), '6 months')).toBeUndefined();
  });
});

describe('pickLevel', () => {
  const scale5 = opts('Brak', 'Podstawowa', 'Komunikatywna', 'Zaawansowana', 'Biegła');

  it('takes the second-highest step for C1/C2 and the one below for B2 (profile decision)', () => {
    expect(pickLevel(scale5, 'C1')?.label).toBe('Zaawansowana');
    expect(pickLevel(scale5, 'C2')?.label).toBe('Zaawansowana');
    expect(pickLevel(scale5, 'B2')?.label).toBe('Komunikatywna');
    expect(pickLevel(scale5, 'Native')?.label).toBe('Biegła');
  });

  it('uses CEFR codes when the form has them', () => {
    expect(pickLevel(opts('A1', 'A2', 'B1', 'B2', 'C1', 'C2'), 'B2')?.label).toBe('B2');
  });

  it('does not trust a scale shorter than four steps', () => {
    expect(pickLevel(opts('Low', 'Medium', 'High'), 'B2')).toBeUndefined();
  });
});
