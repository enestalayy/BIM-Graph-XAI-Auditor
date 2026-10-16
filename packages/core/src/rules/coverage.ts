import type { CompiledQuery } from './compile.ts';
import { classExpression, createParams, selectorExpression } from './cypher-fragments.ts';
import type { IntersectionRule, PropertyRule, Rule } from './schema.ts';

/**
 * What a rule actually examined. It separates "checked and fine" from "could not be
 * checked": zero violations mean little if, for example, no wall carries a fire rating.
 */
export type PropertyCoverage = { readonly targets: number; readonly targetClassMembers: number };
export type IntersectionCoverage = {
  readonly subjects: number;
  readonly objects: number;
  /** Elements of the object classes, ignoring the object conditions. */
  readonly objectClassMembers: number;
  /** Intersections between subjects and objects above the volume threshold. */
  readonly pairs: number;
  readonly mitigations: number;
};
export type CoverageCounts = PropertyCoverage | IntersectionCoverage;

export type CoverageStatus = 'violations' | 'compliant' | 'insufficient-data' | 'not-applicable';

const count = (variable: string, where: string, alias: string) =>
  `CALL { MATCH (${variable}:Element) WHERE ${where} RETURN count(${variable}) AS ${alias} }`;

function propertyCoverage(rule: PropertyRule): CompiledQuery {
  const sink = createParams();
  const cypher = [
    count('t', selectorExpression('t', rule.target, sink), 'targets'),
    count('c', classExpression('c', rule.target), 'targetClassMembers'),
    'RETURN targets, targetClassMembers',
  ].join('\n');
  return { cypher, params: sink.params };
}

function intersectionCoverage(rule: IntersectionRule): CompiledQuery {
  const sink = createParams();
  const lines = [
    count('s', selectorExpression('s', rule.subject, sink), 'subjects'),
    count('o', selectorExpression('o', rule.object, sink), 'objects'),
    count('c', classExpression('c', rule.object), 'objectClassMembers'),
    'CALL {',
    '  MATCH (s:Element)-[x:INTERSECTS_WITH]-(o:Element)',
    `  WHERE ${selectorExpression('s', rule.subject, sink)} AND ${selectorExpression('o', rule.object, sink)} AND x.volume >= ${sink.add(rule.minVolume)}`,
    '  RETURN count(DISTINCT x) AS pairs',
    '}',
    rule.mitigation ? count('m', selectorExpression('m', rule.mitigation, sink), 'mitigations') : 'WITH *, 0 AS mitigations',
    'RETURN subjects, objects, objectClassMembers, pairs, mitigations',
  ];
  return { cypher: lines.join('\n'), params: sink.params };
}

/** A read-only query returning the coverage counts of a rule (one row). */
export function compileCoverage(rule: Rule): CompiledQuery {
  return rule.kind === 'property' ? propertyCoverage(rule) : intersectionCoverage(rule);
}

export function coverageStatus(rule: Rule, counts: CoverageCounts, violations: number): CoverageStatus {
  if (violations > 0) return 'violations';
  if (rule.kind === 'property') {
    return (counts as PropertyCoverage).targets === 0 ? 'not-applicable' : 'compliant';
  }
  const c = counts as IntersectionCoverage;
  if (c.subjects === 0 || c.objectClassMembers === 0) return 'not-applicable';
  // The object class exists but none of its elements meets the conditions. If a condition tests
  // property-set data (e.g. a fire rating), that data is missing; if it only selects (e.g. by
  // name), the model simply has no such element.
  if (c.objects === 0) return rule.object.where.some((condition) => condition.property.includes('.')) ? 'insufficient-data' : 'not-applicable';
  return 'compliant';
}
