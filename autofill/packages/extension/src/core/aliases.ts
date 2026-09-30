import { normalize } from './text';

/**
 * A form is written in the employer's language, the profile in the candidate's.
 * These bridge the two for the two answers every form asks: where you are.
 * Countries come from the platform's own locale data (no table to maintain);
 * cities have no such source, so the Polish ones are listed.
 */
const LOCALES = ['pl', 'en', 'de', 'uk'] as const;

const CITY_ALIASES: Record<string, string[]> = {
  warsaw: ['Warszawa'],
  krakow: ['Kraków', 'Cracow'],
  gdansk: ['Gdańsk'],
  wroclaw: ['Wrocław'],
  poznan: ['Poznań'],
  lodz: ['Łódź'],
  katowice: ['Katowice'],
  szczecin: ['Szczecin'],
  lublin: ['Lublin'],
};

function regionCodes(): string[] {
  const codes: string[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) codes.push(String.fromCharCode(a, b));
  return codes;
}

let countryIndex: Map<string, string> | undefined;

/** normalized country name (any supported locale) -> ISO 3166 code */
function countries(): Map<string, string> {
  if (countryIndex) return countryIndex;
  const index = new Map<string, string>();
  for (const locale of LOCALES) {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    for (const code of regionCodes()) {
      const name = names.of(code);
      if (name && name !== code) index.set(normalize(name), code);
    }
  }
  return (countryIndex = index);
}

/** Other spellings of the same place: "Poland" -> ["pl", "Polska", "Polen", "Польща"]. */
export function placeAliases(value: string): string[] {
  const key = normalize(value);
  const code = countries().get(key);
  if (code) {
    const names = LOCALES.map((l) => new Intl.DisplayNames([l], { type: 'region' }).of(code) ?? '');
    return [code.toLowerCase(), ...names.filter(Boolean)];
  }
  return CITY_ALIASES[key] ?? [];
}
