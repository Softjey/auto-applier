import type { FieldOption } from '@applier/protocol';
import { normalize } from './text';

const YES = new Set(['yes', 'tak']);
const NO = new Set(['no', 'nie']);
const DECLINE =
  /prefer not|decline|do not wish|don t wish|wole nie|nie chce|nie podaje|brak odpowiedzi/;

/** "Yes — citizen of another country with a work permit" starts with the real answer. */
function yesNo(value: string): 'yes' | 'no' | null {
  const first = normalize(value).split(' ')[0] ?? '';
  if (YES.has(first)) return 'yes';
  if (NO.has(first)) return 'no';
  return null;
}

/**
 * Pick the option a profile answer refers to: exact label, then yes/no,
 * then a label the answer starts with. Returns undefined rather than the
 * "closest" option — a wrong pick on an application form is worse than a gap.
 */
export function matchOption(
  options: readonly FieldOption[],
  value: string,
): FieldOption | undefined {
  const wanted = normalize(value);
  if (!wanted) return undefined;

  const exact = options.find((o) => normalize(o.label) === wanted || normalize(o.value) === wanted);
  if (exact) return exact;

  const answer = yesNo(value);
  if (answer) {
    const words = answer === 'yes' ? YES : NO;
    const hit = options.find((o) => words.has(normalize(o.label).split(' ')[0] ?? ''));
    if (hit) return hit;
  }

  // Prefix on a WORD boundary: "b2" -> "B2 Upper intermediate", never "b2b" -> "b2".
  const starts = options.filter((o) => {
    const label = normalize(o.label);
    return label.length >= 2 && (label.startsWith(`${wanted} `) || wanted.startsWith(`${label} `));
  });
  if (starts.length === 1) return starts[0];
  return undefined;
}

/** The "prefer not to say" option of a voluntary demographic question, if there is one. */
export function findDeclineOption(options: readonly FieldOption[]): FieldOption | undefined {
  return options.find((o) => DECLINE.test(normalize(o.label)));
}
