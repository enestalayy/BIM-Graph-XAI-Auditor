import { REQUIRED_OPENING, type ViolationContext } from '@bim/core';
import { describeElement, type Evidence } from './evidence.ts';
import { formatNumber } from './format.ts';
import type { Explainer } from './explainer.ts';

const cite = (...ids: (string | null)[]) => ids.filter(Boolean).map((id) => `[${id}]`).join('');

/**
 * Deterministic baseline: a fixed Turkish sentence template filled from the
 * evidence facts. It cannot hallucinate by construction, which makes it the
 * reference point for comparing LLM explanations.
 */
function render(context: ViolationContext, evidence: Evidence): string {
  const { violation, rule } = context;
  const { roles, facts } = evidence;
  const statementOf = (id: string) => facts.find((f) => f.id === id)!.statement;
  const sentences: string[] = [];

  if (violation.evidence.kind === 'property') {
    sentences.push(`${REQUIRED_OPENING} ${describeElement(violation.subject)}, ${rule.id} kuralının ("${rule.title}") koşullarını sağlamamaktadır ${cite(roles.rule, roles.subject)}.`);
    for (const id of roles.findings) sentences.push(`${statementOf(id).replace(/\.$/, '')} ${cite(id)}.`);
  } else {
    const { intersection: x, mitigation } = violation.evidence;
    const [intersectionFact, missingFact, nearestFact] = roles.findings;
    sentences.push(
      `${REQUIRED_OPENING} ${describeElement(violation.subject)} ile ${describeElement(violation.object!)} kesişmektedir; ` +
      `kesişim hacmi ${formatNumber(x.volume)} m³, penetrasyon derinliği ${formatNumber(x.depth)} m'dir ${cite(roles.subject, roles.object, intersectionFact ?? null)}.`,
    );
    if (mitigation && missingFact && nearestFact) {
      sentences.push(`${rule.id} kuralı gereği kesişim merkezine en fazla ${formatNumber(mitigation.maxDistance)} m mesafede koruyucu bir eleman bulunmalıdır, ancak bulunmamaktadır ${cite(roles.rule, missingFact)}.`);
      sentences.push(mitigation.nearest
        ? `En yakın aday ${describeElement(mitigation.nearest)} olup ${formatNumber(mitigation.nearest.distance)} m uzaklıktadır ${cite(nearestFact)}.`
        : `Modelde bu koşulu sağlayan hiçbir eleman bulunmamaktadır ${cite(nearestFact)}.`);
    } else {
      sentences.push(`Bu kesişim ${rule.id} kuralı ("${rule.title}") kapsamında koordinasyon gerektiren bir bulgudur ${cite(roles.rule)}.`);
    }
  }
  const ruleStatement = statementOf(roles.rule);
  sentences.push(`Kuralın dayanağı: ${ruleStatement.slice(ruleStatement.indexOf('Dayanak: ') + 'Dayanak: '.length).replace(/\.$/, '')} ${cite(roles.rule)}.`);
  return sentences.join(' ');
}

export const templateExplainer: Explainer = {
  method: 'template',
  explain: async (context, evidence) => render(context, evidence),
};
