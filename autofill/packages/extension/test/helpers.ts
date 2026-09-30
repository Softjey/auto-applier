import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Backend } from '../src/core/messaging';
import type { FieldDescriptor, PlanEntry } from '@applier/protocol';

export const fixture = (name: string): string =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8');

/** Stand-in for the page-world selectize bridge (page-bridge.content.ts). */
export function installFakeBridge(options: Record<string, { id: string; label: string }[]>): void {
  document.addEventListener('af-req', (e) => {
    const req = JSON.parse((e as CustomEvent<string>).detail) as {
      id: string;
      op: string;
      target: string;
      optionId?: string;
    };
    const el = document.querySelector(`[data-af-id="${req.target}"]`) as HTMLSelectElement | null;
    const list = options[el?.getAttribute('name') ?? ''];
    const reply = (payload: unknown) =>
      document.dispatchEvent(
        new CustomEvent(`af-res-${req.id}`, { detail: JSON.stringify(payload) }),
      );
    if (!el || !list) return reply({ ok: false });
    if (req.op === 'options') return reply({ ok: true, options: list });
    el.dataset['chosen'] = req.optionId ?? '';
    reply({ ok: true });
  });
}

type Rule = (f: FieldDescriptor) => PlanEntry | undefined;

/** A Backend whose plan comes from label rules; the first rule to answer wins. */
export function fakeBackend(
  rules: Rule[],
  cv = { name: 'CV.pdf', base64: btoa('%PDF-1.4 test') },
): Backend & { asked: FieldDescriptor[] } {
  const asked: FieldDescriptor[] = [];
  return {
    asked,
    plan: async (fields) => {
      asked.push(...fields);
      return {
        plan: fields.map(
          (f) =>
            rules.map((r) => r(f)).find(Boolean) ?? {
              id: f.id,
              action: 'manual',
              reason: 'unknown' as const,
            },
        ),
      };
    },
    cvs: async () => ({ cvs: [] }),
    cv: async () => cv,
  };
}

export const when =
  (re: RegExp, make: (f: FieldDescriptor) => Omit<PlanEntry, 'id'>): Rule =>
  (f) =>
    re.test(f.label) ? ({ id: f.id, ...make(f) } as PlanEntry) : undefined;
