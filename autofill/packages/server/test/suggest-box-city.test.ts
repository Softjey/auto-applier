import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@applier/protocol';
import { createLegacyResolver, withCountryForSuggestions } from '../src/legacy/resolver';

const profile = { personal: { currentCity: 'Warsaw', currentCountry: 'Poland' } };
const city = (extra: Partial<FieldDescriptor>): FieldDescriptor => ({
  id: 'c',
  label: 'Location (City)*',
  key: 'candidate-location',
  kind: 'combobox',
  required: true,
  ...extra,
});
const bare = { status: 'resolved' as const, value: 'Warsaw', source: 'profile (structured)' };

describe('withCountryForSuggestions', () => {
  it('adds the country to a bare city for a box that suggests as you type', () => {
    expect(withCountryForSuggestions(city({ optionsHidden: true }), bare, profile).value).toBe(
      'Warsaw, Poland',
    );
  });

  it('leaves a box that lists its options, and any other answer, alone', () => {
    expect(withCountryForSuggestions(city({}), bare, profile)).toEqual(bare);
    const other = { ...bare, value: 'Remote' };
    expect(withCountryForSuggestions(city({ optionsHidden: true }), other, profile)).toEqual(other);
    expect(withCountryForSuggestions(city({ optionsHidden: true }), bare, {})).toEqual(bare);
  });
});

describe('through the real resolver', () => {
  it('answers a suggest-as-you-type city box with city and country', async () => {
    const result = await createLegacyResolver().classify(city({ optionsHidden: true }));
    expect(result.value).toBe('Warsaw, Poland');
  });
});
