import { assertIfcClassName, quoteIdentifier } from '../cypher/identifiers.ts';
import type { Condition, IntersectionRule, PropertyRule, Rule, Selector } from './schema.ts';

export interface CompiledQuery {
  readonly cypher: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Collects query parameters; values never enter the query text. */
function createParams() {
  const params: Record<string, unknown> = {};
  let next = 0;
  return {
    params,
    add(value: unknown): string {
      const name = `p${next++}`;
      params[name] = value;
      return `$${name}`;
    },
  };
}
type ParamSink = ReturnType<typeof createParams>;

const COMPARISON = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', in: 'IN', contains: 'CONTAINS' } as const;

/** A boolean Cypher expression; a missing property never satisfies a comparison. */
function conditionExpression(variable: string, condition: Condition, sink: ParamSink): string {
  const ref = `${variable}.${quoteIdentifier(condition.property)}`;
  if (!('value' in condition)) return condition.op === 'exists' ? `${ref} IS NOT NULL` : `${ref} IS NULL`;
  return `coalesce(${ref} ${COMPARISON[condition.op]} ${sink.add(condition.value)}, false)`;
}

function selectorExpression(variable: string, selector: Selector, sink: ParamSink): string {
  const labels = selector.classes.map((c) => `${variable}:${quoteIdentifier(assertIfcClassName(c))}`).join(' OR ');
  return [`(${labels})`, ...selector.where.map((c) => conditionExpression(variable, c, sink))].join(' AND ');
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
    lines.push(
      'OPTIONAL MATCH (m:Element)',
      `WHERE ${selectorExpression('m', mitigation, sink)} AND m.minX IS NOT NULL`,
      `WITH s, o, x, cx, cy, cz, m, CASE WHEN m IS NULL THEN null ELSE sqrt(${DISTANCE_TO_BOX}) END AS distance`,
      'ORDER BY distance',
      'WITH s, o, x, cx, cy, cz, collect(CASE WHEN m IS NULL THEN null ELSE m {.globalId, .ifcClass, .name, distance: distance} END) AS candidates',
      `WHERE size([c IN candidates WHERE c.distance <= ${sink.add(mitigation.maxDistance)}]) = 0`,
    );
  }
  lines.push(
    `RETURN ${REF('s')} AS subject, ${REF('o')} AS object,`,
    '  x {.minX, .minY, .minZ, .maxX, .maxY, .maxZ, .volume, .depth} AS intersection,',
    '  {x: cx, y: cy, z: cz} AS centre,',
    `  ${mitigation ? 'head(candidates)' : 'null'} AS nearestMitigation`,
    'ORDER BY subject.globalId, object.globalId',
  );
  return { cypher: lines.join('\n'), params: sink.params };
}

/** Compiles a declarative rule into one parameterised, read-only Cypher query. */
export function compileRule(rule: Rule): CompiledQuery {
  return rule.kind === 'property' ? compilePropertyRule(rule) : compileIntersectionRule(rule);
}
