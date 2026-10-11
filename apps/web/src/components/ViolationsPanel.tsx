import { useState } from 'react';
import { api } from '../api/client.ts';
import type { AuditSummary, ElementRef, Rule, Violation } from '../api/types.ts';
import { groupByRule } from '../lib/group-violations.ts';
import { classHint, turkishClassName } from '../lib/ifc-names.ts';
import { countBySeverity, SEVERITY_LABEL } from '../lib/severity.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { InfoTip } from './InfoTip.tsx';

interface ViolationsPanelProps {
  violations: readonly Violation[];
  rules: ReadonlyMap<string, Rule>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAudited: () => void;
}

const PAGE = 50;

function ElementLabel({ element }: { element: ElementRef }) {
  return (
    <span>
      {turkishClassName(element.ifcClass)}
      {element.name ? <span className="muted"> · {element.name}</span> : null}{' '}
      <InfoTip>{classHint(element.ifcClass)}</InfoTip>
    </span>
  );
}

function RuleInfo({ rule, ruleId }: { rule: Rule | undefined; ruleId: string }) {
  if (!rule) return <InfoTip>Kural {ruleId}</InfoTip>;
  return (
    <InfoTip>
      <strong>{rule.title}</strong>
      {rule.description && <span className="block">{rule.description}</span>}
      <span className="block muted">
        Kod: {rule.id} · Dayanak: {rule.regulation.source}
        {rule.regulation.article ? `, madde ${rule.regulation.article}` : ''}
      </span>
    </InfoTip>
  );
}

export function ViolationsPanel({ violations, rules, selectedId, onSelect, onAudited }: ViolationsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<Readonly<Record<string, number>>>({});
  const counts = countBySeverity(violations);
  const groups = groupByRule(violations);

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

  const toggle = (ruleId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(ruleId)) next.delete(ruleId);
      else next.add(ruleId);
      return next;
    });

  return (
    <section className="panel">
      <h2>Bulgular</h2>
      <button type="button" className="primary" onClick={run} disabled={busy}>{busy ? 'Denetleniyor…' : 'Denetimi çalıştır'}</button>
      <ErrorMessage error={error} />
      {audit && (
        <p className="muted">{audit.outcomes.length} kural, {audit.violations.length} ihlal, {audit.durationMs.toFixed(0)} ms.</p>
      )}
      <div className="row">
        {(['critical', 'major', 'minor'] as const).map((s) => (
          <span key={s} className={`badge ${s}`}>{SEVERITY_LABEL[s]}: {counts[s]}</span>
        ))}
      </div>

      {groups.length === 0 && <p className="muted">İhlal yok ya da denetim henüz çalıştırılmadı.</p>}
      <ul className="group-list">
        {groups.map((group) => {
          const rule = rules.get(group.ruleId);
          const isOpen = open.has(group.ruleId);
          const limit = shown[group.ruleId] ?? PAGE;
          return (
            <li key={group.ruleId} className="group">
              <div className="group-header">
                <button type="button" className="group-toggle" onClick={() => toggle(group.ruleId)} aria-expanded={isOpen}>
                  <span className="chevron">{isOpen ? '▾' : '▸'}</span>
                  <span className={`badge ${group.severity}`}>{SEVERITY_LABEL[group.severity]}</span>
                  <span className="group-title">{rule?.title ?? group.ruleId}</span>
                  <span className="count">{group.violations.length}</span>
                </button>
                <RuleInfo rule={rule} ruleId={group.ruleId} />
              </div>
              {isOpen && (
                <ul className="violation-list">
                  {group.violations.slice(0, limit).map((v) => (
                    <li key={v.id}>
                      <div className={`violation ${v.id === selectedId ? 'selected' : ''}`} role="button" tabIndex={0}
                        onClick={() => onSelect(v.id)} onKeyDown={(e) => e.key === 'Enter' && onSelect(v.id)}>
                        <ElementLabel element={v.subject} />
                        {v.object && <span className="muted">×</span>}
                        {v.object && <ElementLabel element={v.object} />}
                      </div>
                    </li>
                  ))}
                  {group.violations.length > limit && (
                    <li>
                      <button type="button" className="ghost" onClick={() => setShown({ ...shown, [group.ruleId]: limit + PAGE })}>
                        {group.violations.length - limit} bulgu daha göster
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
