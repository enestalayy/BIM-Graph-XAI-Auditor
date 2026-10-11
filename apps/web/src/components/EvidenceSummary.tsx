import type { Violation } from '../api/types.ts';

const num = (n: number) => n.toLocaleString('tr-TR', { maximumSignificantDigits: 3 });

/** The deterministic evidence of a finding, shown before any explanation is generated. */
export function EvidenceSummary({ violation }: { violation: Violation }) {
  const { evidence } = violation;
  if (evidence.kind === 'property') {
    return (
      <ul className="facts">
        {evidence.failures.map((f, i) => (
          <li key={i}><code>{f.property}</code> {f.op}{f.expected != null ? ` ${String(f.expected)}` : ''} — modeldeki değer: {f.actual == null ? 'tanımlı değil' : String(f.actual)}</li>
        ))}
      </ul>
    );
  }
  const { intersection, mitigation } = evidence;
  return (
    <ul className="facts">
      <li>Kesişim hacmi {num(intersection.volume)} m³, penetrasyon derinliği {num(intersection.depth)} m</li>
      {mitigation && (
        <li>
          {num(mitigation.maxDistance)} m içinde {mitigation.classes.join(' / ')} yok;{' '}
          {mitigation.nearest ? `en yakını ${mitigation.nearest.ifcClass} ${num(mitigation.nearest.distance)} m uzakta` : 'modelde hiç aday yok'}
        </li>
      )}
    </ul>
  );
}
