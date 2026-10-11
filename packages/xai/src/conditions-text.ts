import type { Condition, Selector } from '@bim/core';
import { formatValue } from './format.ts';

const OPERATOR_TEXT: Readonly<Record<Condition['op'], string>> = {
  exists: 'tanımlı olmalı',
  notExists: 'tanımlı olmamalı',
  eq: '=',
  neq: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  in: 'şunlardan biri olmalı:',
  contains: 'şunu içermeli:',
};

/** Human-readable form of a condition, e.g. "Pset_WallCommon.FireRating tanımlı olmalı". */
export function conditionText(condition: Condition): string {
  const operator = OPERATOR_TEXT[condition.op];
  if (condition.op === 'exists' || condition.op === 'notExists' || !('value' in condition)) return `${condition.property} ${operator}`;
  const value = Array.isArray(condition.value) ? condition.value.map(formatValue).join(', ') : formatValue(condition.value);
  return `${condition.property} ${operator} ${value}`;
}

export function selectorText(selector: Selector): string {
  const classes = selector.classes.join(' / ');
  return selector.where.length === 0 ? classes : `${classes} (${selector.where.map(conditionText).join(' ve ')})`;
}
