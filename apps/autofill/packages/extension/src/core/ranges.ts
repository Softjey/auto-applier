import type { FieldOption } from '@applier/protocol';
import { normalize } from './text';

/** A salary-band option as a half-open interval: [lo, hi). Either end may be open. */
export interface Range {
  lo?: number;
  hi?: number;
}

const NUMBER = /\d{1,3}(?:[\s\u00a0.,]\d{3})+|\d+(?:[.,]\d+)?/g;
const BELOW = /\b(ponizej|below|under|less than|up to|do|max)\b|</;
const ABOVE = /\b(powyzej|above|over|more than|from|od|min)\b|>|\+\s*$/;

/** "6 000", "6.000", "30,000", "12k" -> 6000, 6000, 30000, 12000. */
function amounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(new RegExp(NUMBER.source, 'g'))) {
    const raw = m[0];
    const grouped = /^\d{1,3}(?:[\s\u00a0.,]\d{3})+$/.test(raw);
    let value = grouped ? Number(raw.replace(/[\s\u00a0.,]/g, '')) : Number(raw.replace(',', '.'));
    if (/^\s*(k|tys)\b/i.test(text.slice((m.index ?? 0) + raw.length))) value *= 1000;
    out.push(value);
  }
  return out;
}

/** "26 000 - 28 000 zł" -> [26000, 28000); "poniżej 6 000 zł" -> (-inf, 6000); "powyżej 34 000" -> [34000, inf). */
export function parseRange(label: string): Range | null {
  const nums = amounts(label);
  const words = normalize(label);
  const [a, b] = nums;
  if (a === undefined) return null;
  if (b !== undefined) return { lo: Math.min(a, b), hi: Math.max(a, b) };
  const n = a;
  if (BELOW.test(words) || BELOW.test(label)) return { hi: n };
  if (ABOVE.test(words) || ABOVE.test(label)) return { lo: n };
  return { lo: n, hi: n };
}

const contains = (r: Range, x: number): boolean =>
  r.lo !== undefined && r.hi !== undefined && r.lo === r.hi
    ? x === r.lo
    : (r.lo === undefined || x >= r.lo) && (r.hi === undefined || x < r.hi);

/**
 * The band option holding `amount`. Only when at least two options parse as ranges —
 * a lone number in an option is a label, not a scale. A figure on a boundary belongs to
 * the HIGHER band: the policy is never to quote under the baseline when the band allows it.
 */
export function pickBand(options: readonly FieldOption[], amount: number): FieldOption | undefined {
  const parsed = options
    .map((option) => ({ option, range: parseRange(option.label) }))
    .filter((p): p is { option: FieldOption; range: Range } => p.range !== null);
  if (parsed.length < 2) return undefined;
  const hits = parsed.filter((p) => contains(p.range, amount));
  hits.sort((a, b) => (b.range.lo ?? -Infinity) - (a.range.lo ?? -Infinity));
  return hits[0]?.option;
}
