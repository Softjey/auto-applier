// Integration: the real resolver against the real profile.json. It asserts
// the SHAPE of the decisions, never personal values.
import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@applier/protocol';
import { createLegacyResolver } from '../src/legacy/resolver';
import { PlanService } from '../src/services/plan-service';

const plans = new PlanService(createLegacyResolver());
const f = (id: string, label: string, kind: FieldDescriptor['kind'] = 'text'): FieldDescriptor => ({
  id,
  label,
  key: id,
  kind,
  required: true,
});

describe('legacy resolver through PlanService', () => {
  it('resolves structural fields, defers salary, uploads the CV, leaves unknowns alone', async () => {
    const plan = await plans.plan([
      f('email', 'E-mail *', 'email'),
      f('salary', 'Expected salary'),
      f('cv', 'CV', 'file'),
      f('odd', 'What is your favourite colour of a submarine?'),
    ]);
    const by = Object.fromEntries(plan.map((p) => [p.id, p]));
    expect(by['email']).toMatchObject({ action: 'set' });
    expect(by['salary']).toMatchObject({ action: 'manual', reason: 'salary' });
    expect(by['cv']).toMatchObject({ action: 'upload-cv' });
    expect(by['odd']).toMatchObject({ action: 'manual' });
  });
});
