// The real salary-quote.mjs on the fake profile (baseline 30 000, floor 25 000 PLN/month).
import { describe, expect, it } from 'vitest';
import type { FieldDescriptor } from '@applier/protocol';
import { SalaryService } from '../src/services/salary-service';

const service = new SalaryService();
const field = (label: string): FieldDescriptor => ({
  id: 's',
  label,
  key: 's',
  kind: 'text',
  required: true,
});

describe('SalaryService', () => {
  it('quotes the baseline when the vacancy published no band', async () => {
    const r = await service.quote(field('Expected salary'));
    expect(r).toMatchObject({
      status: 'quote',
      quote: { amount: 30000, unit: { currency: 'PLN', period: 'month' } },
    });
  });

  it('quotes in the unit the field asks for', async () => {
    const r = await service.quote(field('Hourly rate (PLN)'));
    expect(r).toMatchObject({ status: 'quote', quote: { amount: 180, unit: { period: 'hour' } } });
  });

  it('follows a published band above the baseline, capped at its top', async () => {
    const r = await service.quote(field('Expected salary'), {
      min: 32000,
      max: 38000,
      unit: { currency: 'PLN', period: 'month', basis: 'b2b-net' },
    });
    expect(r.status).toBe('quote');
    if (r.status === 'quote') expect(r.quote.amount).toBeGreaterThanOrEqual(30000);
    if (r.status === 'quote') expect(r.quote.amount).toBeLessThanOrEqual(38000);
  });

  it('refuses to quote under the floor (exit 3) and says so', async () => {
    const r = await service.quote(field('Expected salary'), {
      min: 18000,
      max: 22000,
      unit: { currency: 'PLN', period: 'month', basis: 'b2b-net' },
    });
    expect(r).toMatchObject({ status: 'below-floor' });
  });
});
