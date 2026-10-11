import { useState } from 'react';
import { api } from '../api/client.ts';
import type { AuditSummary, Violation } from '../api/types.ts';
import { countBySeverity, SEVERITY_LABEL, sortViolations } from '../lib/severity.ts';
import { ErrorMessage } from './ErrorMessage.tsx';

interface ViolationsPanelProps {
  violations: readonly Violation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAudited: () => void;
}

const elementLabel = (ref: { ifcClass: string; name: string | null }) => `${ref.ifcClass}${ref.name ? ` · ${ref.name}` : ''}`;

export function ViolationsPanel({ violations, selectedId, onSelect, onAudited }: ViolationsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const counts = countBySeverity(violations);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setAudit(await api.runAudit());
      onAudited();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Bulgular</h2>
      <button type="button" className="primary" onClick={run} disabled={busy}>{busy ? 'Denetleniyor…' : 'Denetimi çalıştır'}</button>
      <ErrorMessage error={error} />
      {audit && (
        <p className="muted">
          {audit.outcomes.length} kural, {audit.violations.length} ihlal, {audit.durationMs.toFixed(0)} ms.
        </p>
      )}
      <div className="row">
        {(['critical', 'major', 'minor'] as const).map((s) => (
          <span key={s} className={`badge ${s}`}>{SEVERITY_LABEL[s]}: {counts[s]}</span>
        ))}
      </div>
      <ul className="violation-list">
        {sortViolations(violations).map((v) => (
          <li key={v.id}>
            <button type="button" className={`violation ${v.id === selectedId ? 'selected' : ''}`} onClick={() => onSelect(v.id)}>
              <span className={`badge ${v.severity}`}>{SEVERITY_LABEL[v.severity]}</span>
              <code>{v.ruleId}</code>
              <span>{elementLabel(v.subject)}</span>
              {v.object && <span className="muted">× {elementLabel(v.object)}</span>}
            </button>
          </li>
        ))}
        {violations.length === 0 && <li className="muted">İhlal yok ya da denetim henüz çalıştırılmadı.</li>}
      </ul>
    </section>
  );
}
