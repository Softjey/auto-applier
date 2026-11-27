import type { FieldDescriptor, PlanEntry, SalaryBand } from '@applier/protocol';
import type { Resolver } from '../legacy/resolver';
import { toPlanEntry } from './plan-entry';
import type { SalaryService } from './salary-service';

export class PlanService {
  constructor(
    private readonly resolver: Resolver,
    private readonly salary: SalaryService,
  ) {}

  async plan(fields: readonly FieldDescriptor[], band?: SalaryBand): Promise<PlanEntry[]> {
    return Promise.all(
      fields.map(async (field) => {
        const entry = toPlanEntry(field.id, await this.resolver.classify(field));
        return entry.action === 'manual' && entry.reason === 'salary'
          ? this.priced(field, band)
          : entry;
      }),
    );
  }

  /** Money is never a qa[] lookup: it is quoted for THIS vacancy, or handed back with the reason. */
  private async priced(field: FieldDescriptor, band?: SalaryBand): Promise<PlanEntry> {
    const result = await this.salary.quote(field, band);
    switch (result.status) {
      case 'quote':
        return { id: field.id, action: 'salary', quote: result.quote };
      case 'below-floor':
        return { id: field.id, action: 'manual', reason: 'below-floor', hint: result.note };
      case 'error':
        return { id: field.id, action: 'manual', reason: 'salary', hint: result.message };
    }
  }
}
