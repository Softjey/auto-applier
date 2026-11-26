import { Cefr, type PlanEntry } from '@applier/protocol';
import type { ClassifyResult } from '../legacy/resolver';

const CONSENT_SOURCE = 'consent policy';
const EEO_SOURCE = 'profile.eeo.policy';
const LANGUAGE_SOURCE = 'profile.languages[]';

/**
 * Turns the resolver's stringly-typed verdict into an explicit instruction.
 * The resolver speaks to a human/agent ("CHECK — mandatory for this
 * application"); the extension needs a closed set of actions it can execute.
 * Anything that is not a plain profile fact becomes `manual` — never a guess.
 */
export function toPlanEntry(id: string, r: ClassifyResult): PlanEntry {
  switch (r.status) {
    case 'skip':
      return { id, action: 'skip' };

    case 'runtime':
      if (r.runtime === 'cv') return { id, action: 'upload-cv' };
      return { id, action: 'manual', reason: 'salary', ...(r.why ? { hint: r.why } : {}) };

    case 'narrative':
      return { id, action: 'manual', reason: 'narrative', ...(r.why ? { hint: r.why } : {}) };

    case 'review':
      return {
        id,
        action: 'manual',
        reason: 'review',
        ...(r.why ? { hint: r.why } : {}),
        candidates: (r.candidates ?? []).map((c) => ({
          id: c.id,
          question: c.q,
          answer: c.a,
          score: c.score,
        })),
      };

    case 'unknown':
      return { id, action: 'manual', reason: 'unknown', ...(r.why ? { hint: r.why } : {}) };

    case 'resolved': {
      const value = typeof r.value === 'string' ? r.value : String(r.value ?? '');
      if (r.source === CONSENT_SOURCE) {
        return value.startsWith('CHECK') ? { id, action: 'check' } : { id, action: 'leave' };
      }
      if (r.source === EEO_SOURCE && value === 'decline') return { id, action: 'decline' };
      if (r.source === LANGUAGE_SOURCE) {
        // "B2 — pick the closest option on this form's own scale": the level is the fact,
        // mapping it onto the form's scale is the extension's job.
        const cefr = Cefr.safeParse(cefrOf(value));
        return cefr.success
          ? { id, action: 'language-level', cefr: cefr.data }
          : { id, action: 'manual', reason: 'language-level', hint: value };
      }
      if (value.trim() === '') return { id, action: 'manual', reason: 'unknown' };
      return { id, action: 'set', value, source: r.source ?? 'profile' };
    }
  }
}

/** "b2 — pick…" -> "B2"; "native level" -> "Native". */
function cefrOf(value: string): string {
  const first = /^\s*([abc][12]|native)/i.exec(value)?.[1] ?? '';
  return first.length === 2
    ? first.toUpperCase()
    : first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}
