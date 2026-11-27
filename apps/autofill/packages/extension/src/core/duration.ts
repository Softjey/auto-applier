import { normalize } from './text';

const IMMEDIATE = /\b(immediate|immediately|asap|now|natychmiast|od zaraz|zaraz|od razu)\b/;
const UNITS: readonly [RegExp, number][] = [
  [/^(day|days|dzien|dni|d)$/, 1],
  [/^(week|weeks|tydzien|tygodnie|tygodni|tyg|w)$/, 7],
  [/^(month|months|miesiac|miesiace|miesiecy|mies|m)$/, 30],
  [/^(year|years|rok|lata|lat)$/, 365],
];

/**
 * A start-date / notice-period phrase as a number of days, so "2 weeks" and
 * "2 tygodnie" are recognised as the same answer. null when it is not a duration.
 */
export function durationDays(text: string): number | null {
  const t = normalize(text);
  if (IMMEDIATE.test(t)) return 0;
  const m = /(\d+)\s*([a-z]+)/.exec(t);
  if (!m) return null;
  const unit = UNITS.find(([re]) => re.test(m[2] ?? ''));
  return unit ? Number(m[1]) * unit[1] : null;
}
