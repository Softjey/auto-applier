import type { CvSummary } from '@applier/protocol';
import { useCallback, useEffect, useState } from 'react';
import type { SiteAdapter } from '../adapters';
import { guessCv } from '../core/guess-cv';
import type { Backend } from '../core/messaging';
import { fillForm } from '../core/run';
import type { FillReport } from '../core/types';

type Phase =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; report: FillReport }
  | { kind: 'error'; message: string };

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
      const report = await fillForm({ adapter, backend, doc: document, cvId });
      setPhase({ kind: 'done', report });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [adapter, backend, cvId]);

  if (!open) {
    return (
      <button className="af-fab" onClick={() => setOpen(true)} aria-label="Open Applier Autofill">
        A
      </button>
    );
  }

  return (
    <aside className="af-panel" aria-label="Applier Autofill">
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

      <button className="af-go" disabled={phase.kind === 'working'} onClick={run}>
        {phase.kind === 'working' ? 'Filling…' : 'Fill form'}
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
  return (
    <section>
      <p>
        <strong>{filled}</strong> filled · {CV_NOTE[report.cv]}
      </p>
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
      {report.manual.length > 0 && (
        <>
          <h4>Needs you ({report.manual.length})</h4>
          <ul>
            {report.manual.map((o) => (
              <li key={o.id}>
                {o.label || '(unlabelled field)'} <em>{o.reason}</em>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
