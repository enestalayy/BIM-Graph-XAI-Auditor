import { useState } from 'react';
import { api } from '../api/client.ts';
import type { AuditSummary, ElementRef, LatestAudit, Rule, Violation } from '../api/types.ts';
import { coverageSentence, sortOutcomes, STATUS_LABEL } from '../lib/coverage-text.ts';
import { groupByRule } from '../lib/group-violations.ts';
import { classHint, turkishClassName } from '../lib/ifc-names.ts';
import { countBySeverity, SEVERITY_LABEL } from '../lib/severity.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { InfoTip } from './InfoTip.tsx';

interface ViolationsPanelProps {
  violations: readonly Violation[];
  latest: LatestAudit | null;
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

export function ViolationsPanel({ violations, latest, rules, selectedId, onSelect, onAudited }: ViolationsPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [audit, setAudit] = useState<AuditSummary | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState<Readonly<Record<string, number>>>({});
  const counts = countBySeverity(violations);
  const groups = new Map(groupByRule(violations).map((g) => [g.ruleId, g]));
  // Audits saved before coverage was recorded have no coverage; they are shown after the next audit.
  const outcomes = latest ? sortOutcomes(latest.outcomes.filter((o) => o.coverage), rules) : [];
  const statusCount = (status: string) => outcomes.filter((o) => o.coverage.status === status).length;

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

      {outcomes.length === 0 && <p className="muted">Denetim henüz çalıştırılmadı.</p>}
      {outcomes.length > 0 && (
        <p className="muted small">
          {outcomes.length} kural çalıştı: {statusCount('violations')} ihlal var, {statusCount('compliant')} uygun,{' '}
          {statusCount('insufficient-data')} veri yetersiz, {statusCount('not-applicable')} uygulanamaz.
        </p>
      )}
      <ul className="group-list">
        {outcomes.map((outcome) => {
          const rule = rules.get(outcome.ruleId);
          const group = groups.get(outcome.ruleId);
          const status = outcome.coverage.status;
          const expandable = Boolean(group);
          const isOpen = expandable && open.has(outcome.ruleId);
          const limit = shown[outcome.ruleId] ?? PAGE;
          return (
            <li key={outcome.ruleId} className={`group status-${status}`}>
              <div className="group-header">
                <button type="button" className="group-toggle" disabled={!expandable} onClick={() => toggle(outcome.ruleId)} aria-expanded={isOpen}>
                  <span className="chevron">{expandable ? (isOpen ? '▾' : '▸') : ''}</span>
                  {status === 'violations' && rule
                    ? <span className={`badge ${rule.severity}`}>{SEVERITY_LABEL[rule.severity]}</span>
                    : <span className={`badge status ${status}`}>{STATUS_LABEL[status]}</span>}
                  <span className="group-title">
                    {rule?.title ?? outcome.ruleId}
                    {rule && <span className="coverage">{coverageSentence(rule, outcome)}</span>}
                  </span>
                  {status === 'violations' && <span className="count">{outcome.violations}</span>}
                </button>
                <RuleInfo rule={rule} ruleId={outcome.ruleId} />
              </div>
              {isOpen && group && (
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
                      <button type="button" className="ghost" onClick={() => setShown({ ...shown, [outcome.ruleId]: limit + PAGE })}>
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
