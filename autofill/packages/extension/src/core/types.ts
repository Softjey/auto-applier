import type { FieldDescriptor, PlanEntry } from '@applier/protocol';

/** A control on the page, paired with what the planner is told about it. */
export interface Control {
  descriptor: FieldDescriptor;
  /** The element to act on; for a checkbox/radio group, its first member. */
  el: HTMLElement;
  /** Every input of a checkbox/radio group, in DOM order. */
  members: HTMLInputElement[];
}

export type Outcome =
  | { status: 'filled'; id: string; label: string }
  | { status: 'left'; id: string; label: string; why: string }
  | { status: 'manual'; id: string; label: string; reason: string; hint?: string }
  | { status: 'failed'; id: string; label: string; why: string };

export interface FillReport {
  outcomes: Outcome[];
  cv: 'uploaded' | 'not-asked' | 'no-cv-selected' | 'failed';
  /** Controls that need a human, in page order. */
  manual: Extract<Outcome, { status: 'manual' }>[];
}

export type { FieldDescriptor, PlanEntry };
