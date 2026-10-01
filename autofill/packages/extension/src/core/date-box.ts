import { durationDays } from './duration';

const FORMAT = /^(?=.*(?:YYYY|RRRR))(?=.*DD)(?=.*MM)[YRDM./\-\s]+$/i;

/** The date format a box announces in its placeholder ("YYYY/MM/DD", "DD.MM.YYYY"), or null. */
export const dateFormat = (placeholder: string): string | null =>
  FORMAT.test(placeholder.trim()) ? placeholder.trim().toUpperCase() : null;

/**
 * A "start in 2 weeks" answer as the date a date box wants: today plus the duration, written in the
 * box's own format. null when the answer is not a duration or the box shows no date format.
 */
export function startDateFor(
  placeholder: string,
  answer: string,
  today: Date = new Date(),
): string | null {
  const format = dateFormat(placeholder);
  const days = durationDays(answer);
  if (!format || days === null) return null;
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const two = (n: number) => String(n).padStart(2, '0');
  return format
    .replace(/YYYY|RRRR/, String(date.getFullYear()))
    .replace(/MM/, two(date.getMonth() + 1))
    .replace(/DD/, two(date.getDate()));
}
