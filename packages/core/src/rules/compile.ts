import { quoteIdentifier } from '../cypher/identifiers.ts';
import { conditionExpression, createParams, selectorExpression } from './cypher-fragments.ts';
import type { Condition, IntersectionRule, PropertyRule, Rule } from './schema.ts';

export interface CompiledQuery {
  readonly cypher: string;
  readonly params: Readonly<Record<string, unknown>>;
}

const REF = (v: string) => `${v} {.globalId, .ifcClass, .name}`;

function compilePropertyRule(rule: PropertyRule): CompiledQuery {
  const sink = createParams();
  const checks = rule.require.map((condition) => {
    const expected = 'value' in condition ? sink.add(condition.value) : 'null';
    return `{property: ${sink.add(condition.property)}, op: ${sink.add(condition.op)}, expected: ${expected}, ` +
      `actual: t.${quoteIdentifier(condition.property)}, passed: ${conditionExpression('t', condition, sink)}}`;
  });
  const cypher = [
    'MATCH (t:Element)',
    `WHERE ${selectorExpression('t', rule.target, sink)}`,
    `WITH t, [${checks.join(',\n  ')}] AS checks`,
    'WITH t, [c IN checks WHERE NOT c.passed | c {.property, .op, .expected, .actual}] AS failures',
    'WHERE size(failures) > 0',
    `RETURN ${REF('t')} AS subject, null AS object, failures`,
    'ORDER BY subject.globalId',
  ].join('\n');
  return { cypher, params: sink.params };
}

/** Distance from the intersection centre (cx, cy, cz) to the AABB of node m. */
const DISTANCE_TO_BOX = ['X', 'Y', 'Z']
  .map((axis) => {
    const c = `c${axis.toLowerCase()}`;
    return `(CASE WHEN ${c} < m.min${axis} THEN m.min${axis} - ${c} WHEN ${c} > m.max${axis} THEN ${c} - m.max${axis} ELSE 0.0 END)^2`;
  })
  .join(' + ');

function compileIntersectionRule(rule: IntersectionRule): CompiledQuery {
  const sink = createParams();
  const lines = [
    'MATCH (s:Element)-[x:INTERSECTS_WITH]-(o:Element)',
    `WHERE ${selectorExpression('s', rule.subject, sink)}`,
    `  AND ${selectorExpression('o', rule.object, sink)}`,
    `  AND x.volume >= ${sink.add(rule.minVolume)}`,
    'WITH s, o, x, (x.minX + x.maxX) / 2.0 AS cx, (x.minY + x.maxY) / 2.0 AS cy, (x.minZ + x.maxZ) / 2.0 AS cz',
  ];
  const { mitigation } = rule;
  if (mitigation) {
    // The nearest candidate is chosen with an explicit reduce (ties broken by GlobalId), so the
    // result does not depend on row order; the crossing elements themselves are never candidates.
    lines.push(
      'OPTIONAL MATCH (m:Element)',
      `WHERE ${selectorExpression('m', mitigation, sink)} AND m.minX IS NOT NULL AND m <> s AND m <> o`,
      `WITH s, o, x, cx, cy, cz, collect(CASE WHEN m IS NULL THEN null ELSE m {.globalId, .ifcClass, .name, distance: sqrt(${DISTANCE_TO_BOX})} END) AS candidates`,
      'WITH s, o, x, cx, cy, cz, reduce(best = null, c IN candidates |',
      '  CASE WHEN best IS NULL OR c.distance < best.distance OR (c.distance = best.distance AND c.globalId < best.globalId)',
      '  THEN c ELSE best END) AS nearest',
      `WHERE nearest IS NULL OR nearest.distance > ${sink.add(mitigation.maxDistance)}`,
    );
  }
  lines.push(
    `RETURN ${REF('s')} AS subject, ${REF('o')} AS object,`,
    '  x {.minX, .minY, .minZ, .maxX, .maxY, .maxZ, .volume, .depth} AS intersection,',
    '  {x: cx, y: cy, z: cz} AS centre,',
    `  ${mitigation ? 'nearest' : 'null'} AS nearestMitigation`,
    'ORDER BY subject.globalId, object.globalId',
  );
  return { cypher: lines.join('\n'), params: sink.params };
}

/** Compiles a declarative rule into one parameterised, read-only Cypher query. */
export function compileRule(rule: Rule): CompiledQuery {
  return rule.kind === 'property' ? compilePropertyRule(rule) : compileIntersectionRule(rule);
}
