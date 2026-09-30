import type { Cefr, FieldOption } from '@applier/protocol';
import { normalize } from './text';

const PLACEHOLDER = /^(-+|wybierz|select|choose|please)/;
const CODE = /\b([abc][12])\b/i;

/**
 * Map the profile's CEFR level onto a form's own proficiency scale.
 *  - The form uses CEFR codes: take the same code.
 *  - Otherwise it is an ordinal scale ("none … native"): the profile decision recorded in
 *    apply-to-jobs is that a C1/C2 profile takes the SECOND-highest step, B2 the one
 *    below, and so on; native takes the top. Fewer than 4 steps is not a scale we trust.
 */
export function pickLevel(options: readonly FieldOption[], cefr: Cefr): FieldOption | undefined {
  const steps = options.filter((o) => !PLACEHOLDER.test(normalize(o.label)));

  const coded = steps.filter((o) => CODE.test(o.label));
  if (coded.length >= 2) {
    if (cefr === 'Native')
      return steps.find((o) => /native|ojczy|natywn|biegl/.test(normalize(o.label)));
    return coded.find((o) => CODE.exec(o.label)?.[1]?.toUpperCase() === cefr);
  }

  const n = steps.length;
  if (n < 4) return undefined;
  const fromTop: Record<Cefr, number> = { Native: 0, C2: 1, C1: 1, B2: 2, B1: 3, A2: 4, A1: 5 };
  return steps[Math.max(0, n - 1 - fromTop[cefr])];
}
