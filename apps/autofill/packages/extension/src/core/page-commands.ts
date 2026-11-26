import type {
  CvSummary,
  FillSummary,
  FormField,
  SalaryBand,
  SubmitResult,
} from '@applier/protocol';
import type { SiteAdapter } from '../adapters';
import { guessCv } from './guess-cv';
import type { Backend } from './messaging';
import { formIsOpen, openForm } from './open-form';
import { fillForm } from './run';
import { scan } from './scan';
import { sleep as defaultSleep } from './sleep';
import { clean } from './text';
import type { Control, FillReport } from './types';

export interface PageDeps {
  adapter: SiteAdapter;
  backend: Backend;
  doc: Document;
  /** Did the last click open a new tab? Its URL when so. */
  spawned?: () => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
}

/** What the last fill said, so a submit can refuse to go on top of a bad one. */
interface LastRun {
  token: string;
  belowFloor: boolean;
}
let lastRun: LastRun | null = null;

/**
 * `spec` is part of a CV folder name (<Company>_<vacancyId>-<Title>): exactly one must match,
 * because the wrong company's CV is worse than none. No spec: the page's own company, or nothing.
 */
export function pickCv(
  cvs: readonly CvSummary[],
  spec: string | undefined,
  title: string,
  host: string,
): { id: string | null } | { error: string } {
  if (!spec) return { id: guessCv(cvs, title, host) };
  const needle = spec.toLowerCase();
  const exact = cvs.filter((c) => c.id === spec);
  const hits = exact.length > 0 ? exact : cvs.filter((c) => c.label.toLowerCase().includes(needle));
  if (hits.length === 1 && hits[0]) return { id: hits[0].id };
  return {
    error:
      hits.length === 0
        ? `No tailored CV matches "${spec}". Available: ${cvs.map((c) => c.label).join(', ') || 'none'}`
        : `"${spec}" matches several CVs: ${hits.map((c) => c.label).join(', ')}`,
  };
}

function summarise(report: FillReport, doc: Document, adapter: SiteAdapter): FillSummary {
  const note = (o: FillReport['outcomes'][number]): string | undefined => {
    if (o.status === 'filled') return o.detail;
    if (o.status === 'manual') return o.reason;
    return o.why;
  };
  return {
    adapter: adapter.id,
    url: doc.location.href,
    formOpen: true,
    filled: report.outcomes.filter((o) => o.status === 'filled').length,
    cv: report.cv,
    manual: report.manual.map((o) => ({
      label: o.label,
      reason: o.reason,
      ...(o.hint ? { hint: o.hint } : {}),
    })),
    failed: report.outcomes.flatMap((o) =>
      o.status === 'failed' ? [{ label: o.label, why: o.why }] : [],
    ),
    choices: report.outcomes.flatMap((o) =>
      o.status === 'filled' && o.detail ? [{ label: o.label, detail: o.detail }] : [],
    ),
    belowFloor: report.manual.some((o) => o.reason === 'below-floor'),
    fields: report.outcomes.map((o) => {
      const n = note(o);
      return { label: o.label, status: o.status, ...(n ? { note: n } : {}) };
    }),
  };
}

export async function pageFill(
  deps: PageDeps,
  opts: { cv?: string | undefined; band?: SalaryBand | undefined; openForm: boolean },
): Promise<FillSummary> {
  const { adapter, backend, doc } = deps;
  lastRun = null;
  const empty = (external?: string): FillSummary => ({
    adapter: adapter.id,
    url: doc.location.href,
    formOpen: false,
    ...(external ? { external } : {}),
    filled: 0,
    cv: 'not-asked',
    manual: [],
    failed: [],
    choices: [],
    belowFloor: false,
    fields: [],
  });

  if (opts.openForm) {
    const opened = await openForm({
      adapter,
      doc,
      ...(deps.spawned ? { spawned: deps.spawned } : {}),
      ...(deps.sleep ? { sleep: deps.sleep } : {}),
    });
    if (!opened.open) return empty(opened.external);
  } else if (!formIsOpen(adapter, doc)) {
    return empty();
  }

  const cvs = (await backend.cvs()).cvs;
  const cv = pickCv(cvs, opts.cv, doc.title, doc.location.hostname);
  if ('error' in cv) throw new Error(cv.error);

  const report = await fillForm({
    adapter,
    backend,
    doc,
    cvId: cv.id,
    band: opts.band,
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
  });
  const summary = summarise(report, doc, adapter);
  // A token only exists for a fill worth submitting on top of: something was filled.
  if (summary.filled > 0) {
    const token = crypto.randomUUID();
    lastRun = { token, belowFloor: summary.belowFloor };
    summary.token = token;
  }
  return summary;
}

function valueOf(control: Control): string {
  const { el, members, descriptor } = control;
  if (descriptor.kind === 'checkbox-group' || descriptor.kind === 'radio-group') {
    return members
      .filter(
        (m) =>
          (m instanceof HTMLInputElement && m.checked) ||
          m.getAttribute('aria-checked') === 'true' ||
          m.getAttribute('aria-pressed') === 'true',
      )
      .map((m) =>
        clean(
          m.getAttribute('aria-label') ??
            m.closest('label')?.textContent ??
            (m instanceof HTMLInputElement ? m.value : m.textContent),
        ),
      )
      .join(', ');
  }
  if (el instanceof HTMLInputElement && el.type === 'file') {
    return [...(el.files ?? [])].map((f) => f.name).join(', ');
  }
  if (el instanceof HTMLSelectElement) {
    return [...el.selectedOptions].map((o) => clean(o.textContent)).join(', ');
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return clean(el.textContent);
}

export async function pageRead({ adapter, doc }: PageDeps): Promise<FormField[]> {
  const root = adapter.scope?.(doc) ?? doc;
  if (!root) throw new Error('No form on this page.');
  const controls = await scan(root, adapter);
  return controls.map((c) => ({
    label: c.descriptor.label,
    kind: c.descriptor.kind,
    required: c.descriptor.required,
    value: valueOf(c),
  }));
}

const SETTLE_MS = 6_000;
const POLL_MS = 250;

/**
 * Press the form's own submit button. The agent only gets here after the user's OK; this
 * function's own job is to refuse the cases a human would also stop at, then to report what the
 * page did, not what we hoped.
 */
export async function pageSubmit(deps: PageDeps, token: string): Promise<SubmitResult> {
  const { adapter, doc } = deps;
  const sleep = deps.sleep ?? defaultSleep;
  if (!adapter.submitButton) {
    throw new Error(`The ${adapter.id} adapter cannot submit; press the site's own button.`);
  }
  if (!lastRun || lastRun.token !== token) {
    throw new Error('Not the form that was filled last: run autofill_fill and review it first.');
  }
  if (lastRun.belowFloor) throw new Error('The salary quote is under your floor: do not submit.');
  const root = adapter.scope?.(doc);
  if (!root) throw new Error('The form is not on the page any more.');
  const button = adapter.submitButton(root);
  if (!button) throw new Error('No submit button found in the form.');
  if (button instanceof HTMLButtonElement && button.disabled) {
    throw new Error('The submit button is disabled: the form is not complete.');
  }
  const form = root instanceof HTMLFormElement ? root : button.closest('form');
  if (form && !form.checkValidity()) {
    const bad = [...form.elements]
      .filter(
        (e): e is HTMLInputElement => 'validity' in e && !(e as HTMLInputElement).validity.valid,
      )
      .map((e) => clean(e.labels?.[0]?.textContent) || e.name || e.id);
    throw new Error(`The form is not valid yet: ${bad.join('; ') || 'a required field'}.`);
  }

  lastRun = null; // one press per fill, whatever happens
  const done = (): SubmitResult | null => {
    if (adapter.submitted?.(doc)) return { submitted: true, signal: 'success-text' };
    if (!formIsOpen(adapter, doc) || !root.isConnected) {
      return {
        submitted: true,
        signal: 'form-gone',
        note: 'The form closed without a confirmation text.',
      };
    }
    return null;
  };

  button.click();
  for (let waited = 0; waited < SETTLE_MS; waited += POLL_MS) {
    await sleep(POLL_MS);
    const result = done();
    if (result) return result;
  }
  return {
    submitted: false,
    signal: 'none',
    note: 'Pressed, and the page showed no confirmation. Look at the page before doing anything else.',
  };
}
