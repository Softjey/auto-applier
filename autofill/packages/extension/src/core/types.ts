import type { FieldDescriptor, PlanEntry } from '@applier/protocol';

/** A control on the page, paired with what the planner is told about it. */
export interface Control {
  descriptor: FieldDescriptor;
  /** The element to act on; for a checkbox/radio group, its first member. */
  el: HTMLElement;
  /**
   * Every member of a checkbox/radio group, in DOM order: native inputs, or
   * `[role=radio|checkbox]` elements for ARIA widgets (Radix / shadcn forms).
   */
  members: HTMLElement[];
}

export type Outcome =
  | { status: 'filled'; id: string; label: string; detail?: string }
  | { status: 'left'; id: string; label: string; why: string }
  | { status: 'manual'; id: string; label: string; reason: string; hint?: string }
  | { status: 'failed'; id: string; label: string; why: string };

export interface FillReport {
  outcomes: Outcome[];
  cv: 'uploaded' | 'not-asked' | 'no-cv-selected' | 'failed';
  /** Controls that need a human, in page order. */
  manual: Extract<Outcome, { status: 'manual' }>[];
  /** Where the time went (ms), summed over passes; `slowest` are the fields that took longest. */
  timing?: {
    scan: number;
    plan: number;
    execute: number;
    slowest: { label: string; ms: number }[];
  };
}

export type { FieldDescriptor, PlanEntry };
