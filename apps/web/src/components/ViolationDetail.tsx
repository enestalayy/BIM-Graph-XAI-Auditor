import { useState } from 'react';
import { api } from '../api/client.ts';
import type { ExplainerKind, ViolationDetail as Detail } from '../api/types.ts';
import { SEVERITY_LABEL } from '../lib/severity.ts';
import { ErrorMessage } from './ErrorMessage.tsx';
import { EvidenceSummary } from './EvidenceSummary.tsx';
import { ExplanationCard } from './ExplanationCard.tsx';
import { InfoTip } from './InfoTip.tsx';
import { classHint, turkishClassName } from '../lib/ifc-names.ts';

interface ViolationDetailProps {
  detail: Detail;
  onExplained: () => void;
}

export function ViolationDetail({ detail, onExplained }: ViolationDetailProps) {
  const [busy, setBusy] = useState<ExplainerKind | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { violation, rule, explanations } = detail;

  async function explain(method: ExplainerKind) {
    setBusy(method);
    setError(null);
    try {
      await api.explain(violation.id, method);
      onExplained();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="detail">
      <h3>
        <span className={`badge ${violation.severity}`}>{SEVERITY_LABEL[violation.severity]}</span> {rule.title}{' '}
        {rule.description && <InfoTip>{rule.description}</InfoTip>}
      </h3>
      <p className="muted">
        <code>{rule.id}</code> · {rule.regulation.source}
        {rule.regulation.article ? `, madde ${rule.regulation.article}` : ', madde belirlenmedi'}
        {!rule.regulation.verified && ' (doğrulanmadı)'}
      </p>
      <dl>
        <dt>Konu <InfoTip>Kuralı ihlal eden eleman (kesişim kurallarında kesen eleman, örn. boru).</InfoTip></dt>
        <dd>{turkishClassName(violation.subject.ifcClass)} <InfoTip>{classHint(violation.subject.ifcClass)}</InfoTip> {violation.subject.name} <code>{violation.subject.globalId}</code></dd>
        {violation.object && (
          <>
            <dt>Nesne <InfoTip>Konu elemanın kestiği eleman (örn. duvar veya döşeme).</InfoTip></dt>
            <dd>{turkishClassName(violation.object.ifcClass)} <InfoTip>{classHint(violation.object.ifcClass)}</InfoTip> {violation.object.name} <code>{violation.object.globalId}</code></dd>
          </>
        )}
      </dl>
      <h4>Kanıt</h4>
      <EvidenceSummary violation={violation} />
      <div className="row">
        <button type="button" onClick={() => explain('template')} disabled={busy !== null}>{busy === 'template' ? 'Üretiliyor…' : 'Şablonla açıkla'}</button>
        <button type="button" onClick={() => explain('ollama')} disabled={busy !== null}>{busy === 'ollama' ? 'LLM yanıtı bekleniyor…' : 'LLM ile açıkla (Ollama)'}</button>
      </div>
      <ErrorMessage error={error} />
      {explanations.map((x) => <ExplanationCard key={x.id} explanation={x} />)}
    </section>
  );
}
