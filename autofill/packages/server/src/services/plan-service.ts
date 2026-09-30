import type { FieldDescriptor, PlanEntry } from '@applier/protocol';
import type { Resolver } from '../legacy/resolver';
import { toPlanEntry } from './plan-entry';

export class PlanService {
  constructor(private readonly resolver: Resolver) {}

  async plan(fields: readonly FieldDescriptor[]): Promise<PlanEntry[]> {
    return Promise.all(
      fields.map(async (field) => toPlanEntry(field.id, await this.resolver.classify(field))),
    );
  }
}
