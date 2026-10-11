import type { Explanation } from '../api/types.ts';

const percent = (x: number) => `%${Math.round(x * 100)}`;

/** One explanation with its grounding metrics; citations [F1] are rendered as fact tags. */
export function ExplanationCard({ explanation }: { explanation: Explanation }) {
  const { grounding } = explanation;
  const parts = explanation.text.split(/(\[F\d+\])/g);
  return (
    <article className="explanation">
      <header>
        <code>{explanation.method}</code>
        <span className={`badge ${grounding.hallucinated ? 'critical' : 'ok'}`}>
          {grounding.hallucinated ? 'Desteksiz bilgi var' : 'Tüm varlıklar kanıtlı'}
        </span>
        <span className="badge">Sadakat {percent(grounding.faithfulness)}</span>
        <span className="badge">Atıf {percent(grounding.citationCoverage)}</span>
        <span className="muted">{explanation.latencyMs.toFixed(0)} ms</span>
      </header>
      <p>{parts.map((part, i) => (/^\[F\d+\]$/.test(part) ? <sup key={i} className="cite">{part.slice(1, -1)}</sup> : part))}</p>
      {grounding.unsupported.length > 0 && (
        <p className="error">Kanıtta bulunmayan: {grounding.unsupported.map((e) => `${e.value} (${e.kind})`).join(', ')}</p>
      )}
      {!grounding.startsWithRequiredPhrase && <p className="muted">Uyarı: açıklama "Bu bir hatadır çünkü" ile başlamıyor.</p>}
      <details>
        <summary>Kullanılan olgular ({explanation.facts.length})</summary>
        <ol className="facts">
          {explanation.facts.map((f) => <li key={f.id}><strong>{f.id}</strong> {f.statement}</li>)}
        </ol>
      </details>
    </article>
  );
}
