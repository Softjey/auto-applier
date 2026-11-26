// A qa[] entry has two voices: `answer` (read by the agent) and `value` / `pick` (what a form gets).
import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@applier/protocol';
import { createLegacyResolver } from '../src/legacy/resolver';

const resolver = createLegacyResolver();
const field = (
  label: string,
  kind: FieldDescriptor['kind'],
  options?: string[],
): FieldDescriptor => ({
  id: 'f',
  label,
  key: '',
  kind,
  required: true,
  ...(options ? { options: options.map((o) => ({ value: o, label: o })) } : {}),
});

describe('qa[] value / pick / null', () => {
  it("types the entry's `value`, never its explanatory answer, into a box", async () => {
    const r = await resolver.classify(field('Preferred contract type?', 'text'));
    expect(r).toMatchObject({ status: 'resolved', value: 'B2B', source: 'qa:test-contract' });
  });

  it('matches a list against the whole answer, so the option is found by its start', async () => {
    const r = await resolver.classify(field('Preferred contract type?', 'select', ['B2B', 'UoP']));
    expect(String(r.value)).toMatch(/^B2B — /);
  });

  it('uses `pick` for a list and `value` for a box when they differ', async () => {
    const q = 'How many years of React experience do you have?';
    expect((await resolver.classify(field(q, 'number'))).value).toBe('3');
    expect(
      (await resolver.classify(field(q, 'radio-group', ['3-4 years', '5+ years']))).value,
    ).toBe('3-4 years');
  });

  it('hands `value: null` back to the agent with the reason, and types nothing', async () => {
    const r = await resolver.classify(field('What are your pronouns?', 'text'));
    expect(r.status).toBe('review');
    expect(r.why).toMatch(/rule for the agent/);
    expect(r.candidates?.[0]?.id).toBe('test-pronouns');
  });
});
