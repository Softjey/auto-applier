// A qa[] answer can end in a note to the agent; a box must never receive the note.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../src/config';

interface Typeable {
  ok: boolean;
  value?: string;
}
const { typeableAnswer } = (await import(
  pathToFileURL(resolve(REPO_ROOT, '.claude/skills/apply-to-jobs/scripts/resolve-fields.mjs')).href
)) as { typeableAnswer: (answer: string, kind: string) => Typeable };

const NOTE =
  '3-4 years (choose the 3-4 bracket where offered; where a single number is required, 3).';

describe('typeableAnswer', () => {
  it('types the number a "single number is required" note names', () => {
    expect(typeableAnswer(NOTE, 'textarea')).toEqual({ ok: true, value: '3' });
    expect(typeableAnswer(NOTE, 'number')).toEqual({ ok: true, value: '3' });
  });

  it('hands any other note-bearing answer back to the agent for a text box', () => {
    const answer = '2 years (pick the bracket that fits, otherwise ask)';
    expect(typeableAnswer(answer, 'textarea').ok).toBe(false);
  });

  it('keeps the whole answer for a list, where only its start is read', () => {
    expect(typeableAnswer(NOTE, 'select')).toEqual({ ok: true, value: NOTE });
    expect(typeableAnswer(NOTE, 'radio-group').ok).toBe(true);
  });

  it('types the text a `write exactly` note names', () => {
    const answer = 'In 2 weeks. (2 weeks notice; write exactly "In 2 weeks" in a free-text box.)';
    expect(typeableAnswer(answer, 'text')).toEqual({ ok: true, value: 'In 2 weeks' });
  });

  it('never types an explanation written for the agent into a box', () => {
    const answer =
      'B2B — the compensation anchor in profile.json is 150 PLN/h net on a B2B invoice; open to UoP if B2B is unavailable.';
    expect(typeableAnswer(answer, 'text')).toEqual({ ok: true, value: 'B2B' });
    expect(typeableAnswer(answer, 'textarea')).toEqual({ ok: true, value: 'B2B' });
    // the whole answer is still what a list matches against
    expect(typeableAnswer(answer, 'select')).toEqual({ ok: true, value: answer });
  });

  it('hands back an answer that is prose for the agent with no short lead', () => {
    const answer =
      'Self-employed / Freelance — small B2B projects only. Never pick "Employed full-time". Stated by the user 2026-09-22.';
    expect(typeableAnswer(answer, 'text').ok).toBe(true); // lead "Self-employed / Freelance" is short
    const long =
      'He worked on several large e-commerce platforms for years and — per the standing policy — never volunteers the details.';
    expect(typeableAnswer(long, 'text').ok).toBe(false);
  });

  it('leaves a plain answer alone', () => {
    expect(typeableAnswer('2 weeks', 'text')).toEqual({ ok: true, value: '2 weeks' });
    expect(typeableAnswer('Yes (B2B, anywhere in the EU).', 'text').ok).toBe(true);
  });
});
