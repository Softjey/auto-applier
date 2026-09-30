// Integration: the real resolver and the real salary-quote.mjs against the FAKE test
// profile (vitest.config.ts points APPLIER_PROFILE_PATH at it).
import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@applier/protocol';
import { createLegacyResolver } from '../src/legacy/resolver';
import { PlanService } from '../src/services/plan-service';
import { SalaryService } from '../src/services/salary-service';

const plans = new PlanService(createLegacyResolver(), new SalaryService());
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
    expect(by['salary']).toMatchObject({
      action: 'salary',
      quote: { amount: 30000, unit: { currency: 'PLN', period: 'month' } },
    });
    expect(by['cv']).toMatchObject({ action: 'upload-cv' });
    expect(by['odd']).toMatchObject({ action: 'manual' });
  });
});
