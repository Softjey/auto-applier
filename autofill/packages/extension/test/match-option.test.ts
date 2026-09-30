import { describe, expect, it } from 'vitest';
import { findDeclineOption, matchOption } from '../src/core/match-option';

const opts = (...labels: string[]) => labels.map((l) => ({ value: l.toLowerCase(), label: l }));

describe('matchOption', () => {
  it('matches exactly, ignoring case and diacritics', () => {
    expect(matchOption(opts('Warszawa', 'Kraków'), 'krakow')?.label).toBe('Kraków');
  });

  it('reads the yes/no at the start of a long answer, in either language', () => {
    expect(
      matchOption(opts('Tak', 'Nie'), 'Yes — citizen of another country with a work permit')?.label,
    ).toBe('Tak');
    expect(matchOption(opts('Yes', 'No'), 'No — I do not require sponsorship')?.label).toBe('No');
  });

  it('matches by prefix only when unambiguous', () => {
    expect(matchOption(opts('B2 Upper intermediate', 'C1 Advanced'), 'B2')?.label).toBe(
      'B2 Upper intermediate',
    );
    expect(matchOption(opts('B2 Upper', 'B2 Lower'), 'B2')).toBeUndefined();
  });

  it('returns nothing rather than the closest guess', () => {
    expect(matchOption(opts('Od zaraz', '2 tygodnie'), 'Immediately')).toBeUndefined();
    expect(matchOption(opts('A'), '')).toBeUndefined();
  });
});

describe('findDeclineOption', () => {
  it('finds a prefer-not-to-say option in English and Polish', () => {
    expect(findDeclineOption(opts('Male', 'Female', 'Prefer not to say'))?.label).toBe(
      'Prefer not to say',
    );
    expect(findDeclineOption(opts('Kobieta', 'Mężczyzna', 'Wolę nie podawać'))?.label).toBe(
      'Wolę nie podawać',
    );
    expect(findDeclineOption(opts('Male', 'Female'))).toBeUndefined();
  });
});
