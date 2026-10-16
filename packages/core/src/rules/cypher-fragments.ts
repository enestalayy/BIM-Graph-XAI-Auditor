import { assertIfcClassName, quoteIdentifier } from '../cypher/identifiers.ts';
import type { Condition, Selector } from './schema.ts';

/** Collects query parameters; values never enter the query text. */
export function createParams() {
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
export type ParamSink = ReturnType<typeof createParams>;

const COMPARISON = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', in: 'IN', contains: 'CONTAINS' } as const;

/** A boolean Cypher expression; a missing property never satisfies a comparison. */
export function conditionExpression(variable: string, condition: Condition, sink: ParamSink): string {
  const ref = `${variable}.${quoteIdentifier(condition.property)}`;
  if (!('value' in condition)) return condition.op === 'exists' ? `${ref} IS NOT NULL` : `${ref} IS NULL`;
  return `coalesce(${ref} ${COMPARISON[condition.op]} ${sink.add(condition.value)}, false)`;
}

export function selectorExpression(variable: string, selector: Selector, sink: ParamSink): string {
  const labels = selector.classes.map((c) => `${variable}:${quoteIdentifier(assertIfcClassName(c))}`).join(' OR ');
  return [`(${labels})`, ...selector.where.map((c) => conditionExpression(variable, c, sink))].join(' AND ');
}

/** Only the class part of a selector, ignoring its conditions. */
export function classExpression(variable: string, selector: Selector): string {
  return `(${selector.classes.map((c) => `${variable}:${quoteIdentifier(assertIfcClassName(c))}`).join(' OR ')})`;
}
