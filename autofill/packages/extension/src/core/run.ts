import type { PlanEntry, SalaryBand } from '@applier/protocol';
import type { SiteAdapter } from '../adapters';
import { execute } from './execute';
import type { Backend } from './messaging';
import { scan } from './scan';
import { attachFile, base64ToFile } from './setters';
import type { Control, FillReport, Outcome } from './types';

export interface RunOptions {
  adapter: SiteAdapter;
  backend: Backend;
  doc: Document;
  /** Which tailored CV to attach; null attaches nothing. */
  cvId: string | null;
  /** The band this vacancy published, when the user typed it in; otherwise "no band". */
  band?: SalaryBand | undefined;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One fill: scan -> plan (server) -> execute -> CV -> (optionally) settle and
 * fill again. Two passes only when the site rewrites the form after an upload.
 */
export async function fillForm({
  adapter,
  backend,
  doc,
  cvId,
  band,
  sleep = defaultSleep,
}: RunOptions): Promise<FillReport> {
  const root = adapter.scope?.(doc) ?? doc;
  if (!root) return { outcomes: [], cv: 'not-asked', manual: [] };

  const outcomes = new Map<string, Outcome>();
  let cv: FillReport['cv'] = 'not-asked';

  const pass = async (): Promise<Control[]> => {
    const controls = await scan(root, adapter);
    const { plan } = await backend.plan(
      controls.map((c) => c.descriptor),
      band,
    );
    const byId = new Map<string, PlanEntry>(plan.map((p) => [p.id, p]));
    for (const control of controls) {
      const entry = byId.get(control.descriptor.id);
      if (!entry || entry.action === 'upload-cv') continue;
      const outcome = await execute(control, entry, adapter);
      // Keep the strongest result across passes: a field filled in pass one must not
      // be downgraded to "already filled" by pass two.
      const prev = outcomes.get(`${control.descriptor.key}|${control.descriptor.label}`);
      if (!(prev?.status === 'filled' && outcome.status === 'left')) {
        outcomes.set(`${control.descriptor.key}|${control.descriptor.label}`, outcome);
      }
    }
    return controls;
  };

  const first = await pass();

  const fileControl = first.find((c) => c.descriptor.kind === 'file');
  if (fileControl) {
    cv = await uploadCv(fileControl, backend, cvId);
    if (cv === 'uploaded' && adapter.refillAfterCvMs) {
      await sleep(adapter.refillAfterCvMs);
      await pass();
    }
  }

  const list = [...outcomes.values()];
  return {
    outcomes: list,
    cv,
    manual: list.filter((o): o is Extract<Outcome, { status: 'manual' }> => o.status === 'manual'),
  };
}

async function uploadCv(
  control: Control,
  backend: Backend,
  cvId: string | null,
): Promise<FillReport['cv']> {
  if (!cvId) return 'no-cv-selected';
  try {
    const { name, base64 } = await backend.cv(cvId);
    return attachFile(control.el as HTMLInputElement, base64ToFile(base64, name))
      ? 'uploaded'
      : 'failed';
  } catch {
    return 'failed';
  }
}
