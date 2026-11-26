import { describe, expect, it } from 'vitest';
import type { ClassifyResult } from '../src/legacy/resolver';
import { toPlanEntry } from '../src/services/plan-entry';

const entry = (r: ClassifyResult) => toPlanEntry('f1', r);

describe('toPlanEntry', () => {
  it('turns a profile fact into a set instruction with its source', () => {
    expect(entry({ status: 'resolved', value: 'a@b.c', source: 'profile (structured)' })).toEqual({
      id: 'f1',
      action: 'set',
      value: 'a@b.c',
      source: 'profile (structured)',
    });
  });

  it('never sets an empty value', () => {
    expect(entry({ status: 'resolved', value: '  ', source: 'x' })).toMatchObject({
      action: 'manual',
      reason: 'unknown',
    });
  });

  it('maps the consent policy to check / leave', () => {
    const consent = (value: string) =>
      entry({ status: 'resolved', source: 'consent policy', value });
    expect(consent('CHECK — mandatory for this application').action).toBe('check');
    expect(consent('LEAVE UNCHECKED — broader than this one application').action).toBe('leave');
  });

  it('maps the EEO policy to decline', () => {
    expect(
      entry({ status: 'resolved', source: 'profile.eeo.policy', value: 'decline' }).action,
    ).toBe('decline');
  });

  it('turns the profile language level into a CEFR instruction, not a guess at the form scale', () => {
    expect(
      entry({
        status: 'resolved',
        source: 'profile.languages[]',
        value: 'B2 — pick the closest option',
      }),
    ).toEqual({ id: 'f1', action: 'language-level', cefr: 'B2' });
    expect(
      entry({
        status: 'resolved',
        source: 'profile.languages[]',
        value: 'Native — pick the closest',
      }),
    ).toMatchObject({ action: 'language-level', cefr: 'Native' });
    expect(
      entry({ status: 'resolved', source: 'profile.languages[]', value: 'fluent' }),
    ).toMatchObject({ action: 'manual', reason: 'language-level' });
  });

  it('routes the CV upload and the salary separately', () => {
    expect(entry({ status: 'runtime', runtime: 'cv' }).action).toBe('upload-cv');
    expect(entry({ status: 'runtime', runtime: 'salary', why: 'compute' })).toMatchObject({
      action: 'manual',
      reason: 'salary',
    });
  });

  it('keeps qa candidates on a review, renamed for the wire', () => {
    expect(
      entry({
        status: 'review',
        candidates: [{ id: 'q1', q: 'Question?', a: 'Answer', score: 0.7 }],
      }),
    ).toMatchObject({
      action: 'manual',
      reason: 'review',
      candidates: [{ id: 'q1', question: 'Question?', answer: 'Answer', score: 0.7 }],
    });
  });

  it.each(['narrative', 'unknown'] as const)('leaves %s to a human', (status) => {
    expect(entry({ status })).toMatchObject({ action: 'manual', reason: status });
  });

  it('skips honeypots', () => {
    expect(entry({ status: 'skip' }).action).toBe('skip');
  });
});
