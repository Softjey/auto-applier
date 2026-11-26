import type { CvSummary, SalaryBand, SalaryUnit } from '@applier/protocol';
import { useCallback, useEffect, useState } from 'react';
import type { SiteAdapter } from '../adapters';
import { guessCv } from '../core/guess-cv';
import type { Backend } from '../core/messaging';
import { fillForm } from '../core/run';
import { useDock } from './dock';
import { usePageReady } from './use-page-ready';
import type { FillReport } from '../core/types';

type Phase =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; report: FillReport }
  | { kind: 'error'; message: string };

interface BandDraft {
  min: string;
  max: string;
  currency: string;
  period: SalaryUnit['period'];
  basis: SalaryUnit['basis'];
}

const EMPTY_BAND: BandDraft = {
  min: '',
  max: '',
  currency: 'PLN',
  period: 'month',
  basis: 'b2b-net',
};

/** The band as typed in the panel; nothing typed means the vacancy published none. */
function toBand(draft: BandDraft): SalaryBand | undefined {
  const min = Number(draft.min.replace(/[\s,]/g, ''));
  const max = Number(draft.max.replace(/[\s,]/g, ''));
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;
  if (!hasMin && !hasMax) return undefined;
  return {
    ...(hasMin ? { min } : {}),
    ...(hasMax ? { max } : {}),
    unit: { currency: draft.currency, period: draft.period, basis: draft.basis },
  };
}

const CV_NOTE: Record<FillReport['cv'], string> = {
  uploaded: 'CV attached',
  'not-asked': 'No file field on this form',
  'no-cv-selected': 'No CV selected — attach it yourself',
  failed: 'CV upload failed — attach it yourself',
};

export function Panel({ adapter, backend }: { adapter: SiteAdapter; backend: Backend }) {
  const [open, setOpen] = useState(true);
  const [cvs, setCvs] = useState<CvSummary[]>([]);
  const [cvId, setCvId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [band, setBand] = useState<BandDraft>(EMPTY_BAND);
  const pageReady = usePageReady();
  useDock('right', open);

  useEffect(() => {
    backend.cvs().then(
      ({ cvs: list }) => {
        setCvs(list);
        setCvId(guessCv(list, document.title, location.hostname));
      },
      () => undefined, // server down: surfaced on the first fill
    );
  }, [backend]);

  const run = useCallback(async () => {
    setPhase({ kind: 'working' });
    try {
      const report = await fillForm({ adapter, backend, doc: document, cvId, band: toBand(band) });
      setPhase({ kind: 'done', report });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [adapter, backend, cvId, band]);

  if (!open) {
    return (
      <button className="af-fab" onClick={() => setOpen(true)} aria-label="Open Applier Autofill">
        A
      </button>
    );
  }

  return (
    <aside className="af-panel af-docked" aria-label="Applier Autofill">
      <header>
        <strong>Applier Autofill</strong>
        <button className="af-x" onClick={() => setOpen(false)} aria-label="Minimise">
          ×
        </button>
      </header>

      <label className="af-row">
        CV
        <select value={cvId ?? ''} onChange={(e) => setCvId(e.target.value || null)}>
          <option value="">— none —</option>
          {cvs.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.label}
            </option>
          ))}
        </select>
      </label>

      <details className="af-band">
        <summary>Salary band of this vacancy (optional)</summary>
        <p className="af-note">
          As published on the posting. Empty = no band: your baseline is quoted.
        </p>
        <div className="af-grid">
          <input
            placeholder="min"
            inputMode="numeric"
            value={band.min}
            onChange={(e) => setBand({ ...band, min: e.target.value })}
          />
          <input
            placeholder="max"
            inputMode="numeric"
            value={band.max}
            onChange={(e) => setBand({ ...band, max: e.target.value })}
          />
          <select
            value={band.currency}
            onChange={(e) => setBand({ ...band, currency: e.target.value })}
          >
            {['PLN', 'EUR', 'USD', 'GBP'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={band.period}
            onChange={(e) => setBand({ ...band, period: e.target.value as SalaryUnit['period'] })}
          >
            <option value="month">/ month</option>
            <option value="hour">/ hour</option>
            <option value="year">/ year</option>
          </select>
          <select
            value={band.basis}
            onChange={(e) => setBand({ ...band, basis: e.target.value as SalaryUnit['basis'] })}
          >
            <option value="b2b-net">B2B net</option>
            <option value="uop-gross">UoP gross</option>
          </select>
        </div>
      </details>

      <button className="af-go" disabled={!pageReady || phase.kind === 'working'} onClick={run}>
        {phase.kind === 'working' ? 'Filling…' : pageReady ? 'Fill form' : 'Waiting for the page…'}
      </button>
      <p className="af-note">
        Fills what is a fact in your profile. Never submits — you press Send.
      </p>

      {phase.kind === 'error' && <p className="af-err">{phase.message}</p>}
      {phase.kind === 'done' && <Result report={phase.report} />}
    </aside>
  );
}

function Result({ report }: { report: FillReport }) {
  const filled = report.outcomes.filter((o) => o.status === 'filled').length;
  const failed = report.outcomes.filter((o) => o.status === 'failed');
  const decisions = report.outcomes.flatMap((o) => (o.status === 'filled' && o.detail ? [o] : []));
  const belowFloor = report.manual.filter((o) => o.reason === 'below-floor');
  return (
    <section>
      <p data-testid="summary">
        <strong>{filled}</strong> filled · {CV_NOTE[report.cv]}
      </p>
      {report.timing && (
        <p className="af-note" data-testid="timing">
          scan {(report.timing.scan / 1000).toFixed(1)}s · plan{' '}
          {(report.timing.plan / 1000).toFixed(1)}s · fill{' '}
          {(report.timing.execute / 1000).toFixed(1)}s
          {report.timing.slowest.length > 0 &&
            ` · slowest: ${report.timing.slowest.map((s) => `${s.label} ${s.ms}ms`).join('; ')}`}
        </p>
      )}
      {failed.length > 0 && (
        <>
          <h4>Did not stick</h4>
          <ul>
            {failed.map((o) => (
              <li key={o.id}>
                {o.label} <em>{o.why}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      {belowFloor.length > 0 && (
        <p className="af-err">
          <strong>Below your salary floor — do not submit.</strong> {belowFloor[0]?.hint}
        </p>
      )}
      {decisions.length > 0 && (
        <>
          <h4>Check these choices</h4>
          <ul>
            {decisions.map((o) => (
              <li key={o.id}>
                {o.label} <em>{o.detail}</em>
              </li>
            ))}
          </ul>
        </>
      )}
      <details>
        <summary>All fields ({report.outcomes.length})</summary>
        <ul>
          {report.outcomes.map((o) => (
            <li key={o.id}>
              <strong>{o.status}</strong> {o.label || '(unlabelled)'}{' '}
              <em>
                {'why' in o ? o.why : 'reason' in o ? o.reason : 'detail' in o ? o.detail : ''}
              </em>
            </li>
          ))}
        </ul>
      </details>
      {report.manual.length > 0 && (
        <>
          <h4>Needs you ({report.manual.length})</h4>
          <ul>
            {report.manual.map((o) => (
              <li key={o.id}>
                {o.label || '(unlabelled field)'} <em>{o.reason}</em>
                {o.hint && <span className="af-hint"> — {o.hint}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
