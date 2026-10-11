import type { Condition, ElementContext, ElementRef, EvidenceFact, ViolationContext } from '@bim/core';
import { conditionText, selectorText } from './conditions-text.ts';
import { formatNumber, formatValue } from './format.ts';

/** The facts handed to an explainer, plus which fact plays which role. */
export interface Evidence {
  readonly facts: readonly EvidenceFact[];
  readonly roles: {
    readonly rule: string;
    readonly subject: string;
    readonly object: string | null;
    /** Failed checks (property rules) or intersection and mitigation facts. */
    readonly findings: readonly string[];
  };
}

export function describeElement(ref: ElementRef): string {
  return `${ref.ifcClass}${ref.name ? ` "${ref.name}"` : ''} (GlobalId ${ref.globalId})`;
}

function elementStatement(label: string, ref: ElementRef, context: ElementContext | undefined, keys: readonly string[]): string {
  const parts = [`${label}: ${describeElement(ref)}`];
  if (context?.disciplines.length) parts.push(`model: ${context.disciplines.join(', ')}`);
  if (context?.containers.length) parts.push(`konum: ${context.containers.join(', ')}`);
  for (const key of [...new Set(keys)]) parts.push(`${key} = ${formatValue(context?.properties[key])}`);
  return `${parts.join('; ')}.`;
}

const keysOf = (conditions: readonly Condition[]) => conditions.map((c) => c.property);

/**
 * Turns a violation context into numbered, self-contained facts. Only element
 * properties referenced by the rule are included, so the explainer sees exactly
 * the evidence the deterministic check used.
 */
export function buildEvidence(context: ViolationContext): Evidence {
  const { violation, rule, elements } = context;
  const facts: EvidenceFact[] = [];
  const add = (statement: string): string => {
    const id = `F${facts.length + 1}`;
    facts.push({ id, statement });
    return id;
  };

  const { regulation } = rule;
  const article = regulation.article
    ? `madde ${regulation.article}${regulation.verified ? '' : ' (madde numarası henüz doğrulanmamıştır)'}`
    : 'madde numarası henüz belirlenmemiştir';
  const ruleFact = add(`Kural ${rule.id}: "${rule.title}" (önem derecesi: ${violation.severity}). Dayanak: ${regulation.source}; ${article}.`);

  const subjectKeys = rule.kind === 'property' ? [...keysOf(rule.target.where), ...keysOf(rule.require)] : keysOf(rule.subject.where);
  const subjectFact = add(elementStatement('Konu eleman', violation.subject, elements[violation.subject.globalId], subjectKeys));
  const objectFact = violation.object && rule.kind === 'intersection'
    ? add(elementStatement('Nesne eleman', violation.object, elements[violation.object.globalId], keysOf(rule.object.where)))
    : null;

  const findings: string[] = [];
  const { evidence } = violation;
  if (evidence.kind === 'property') {
    for (const failure of evidence.failures) {
      const requirement = conditionText({ property: failure.property, op: failure.op, value: failure.expected } as Condition);
      findings.push(add(`Zorunlu koşul karşılanmamaktadır: ${requirement}; modeldeki değer: ${formatValue(failure.actual)}.`));
    }
  } else {
    const { intersection: x, centre, mitigation } = evidence;
    findings.push(add(
      `İki eleman kesişmektedir: kesişim hacmi ${formatNumber(x.volume)} m³, penetrasyon derinliği ${formatNumber(x.depth)} m, ` +
      `kesişim merkezi (x ${formatNumber(centre.x)}; y ${formatNumber(centre.y)}; z ${formatNumber(centre.z)}) m.`,
    ));
    if (mitigation && rule.kind === 'intersection' && rule.mitigation) {
      findings.push(add(
        `Kesişim merkezine en fazla ${formatNumber(mitigation.maxDistance)} m mesafede ${selectorText(rule.mitigation)} ` +
        'koşulunu sağlayan bir eleman bulunamamıştır.',
      ));
      findings.push(add(mitigation.nearest
        ? `Bu koşulu sağlayan en yakın eleman ${describeElement(mitigation.nearest)} olup kesişim merkezine ${formatNumber(mitigation.nearest.distance)} m uzaklıktadır.`
        : 'Modelde bu koşulu sağlayan hiçbir eleman bulunmamaktadır.'));
    }
  }
  return { facts, roles: { rule: ruleFact, subject: subjectFact, object: objectFact, findings } };
}
