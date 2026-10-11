import type { Condition, RuleInput } from '../api/types.ts';

export type ConditionOp = Condition['op'];

export const OPERATORS: ReadonlyArray<{ op: ConditionOp; label: string; needsValue: boolean }> = [
  { op: 'exists', label: 'tanımlı', needsValue: false },
  { op: 'notExists', label: 'tanımsız', needsValue: false },
  { op: 'eq', label: '=', needsValue: true },
  { op: 'neq', label: '≠', needsValue: true },
  { op: 'gt', label: '>', needsValue: true },
  { op: 'gte', label: '≥', needsValue: true },
  { op: 'lt', label: '<', needsValue: true },
  { op: 'lte', label: '≤', needsValue: true },
  { op: 'in', label: 'şunlardan biri', needsValue: true },
  { op: 'contains', label: 'içerir', needsValue: true },
];

/** Smallest free id of the form R-01, R-02, ... */
export function nextRuleId(existing: readonly string[]): string {
  const taken = new Set(existing);
  for (let n = 1; ; n++) {
    const id = `R-${String(n).padStart(2, '0')}`;
    if (!taken.has(id)) return id;
  }
}

export function newRule(kind: RuleInput['kind'], existingIds: readonly string[]): RuleInput {
  const base = {
    id: nextRuleId(existingIds),
    title: kind === 'property' ? 'Yeni özellik kuralı' : 'Yeni kesişim kuralı',
    severity: 'major' as const,
    enabled: true,
    regulation: { source: '', article: null, verified: false },
  };
  return kind === 'property'
    ? { ...base, kind, target: { classes: ['IfcWall'], where: [] }, require: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }] }
    : { ...base, kind, subject: { classes: ['IfcFlowSegment'], where: [] }, object: { classes: ['IfcWall'], where: [] }, minVolume: 0 };
}

/**
 * Interprets the text typed into a condition's value box. Numeric operators take
 * numbers, "in" takes a comma-separated list, eq/neq read true/false and numbers
 * as such; everything else stays a string.
 */
export function parseConditionValue(op: ConditionOp, text: string): string | number | boolean | (string | number)[] {
  const trimmed = text.trim();
  const asNumber = trimmed !== '' && Number.isFinite(Number(trimmed.replace(',', '.'))) ? Number(trimmed.replace(',', '.')) : null;
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') return asNumber ?? Number.NaN;
  if (op === 'in') return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  if (op === 'eq' || op === 'neq') {
    if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true';
    if (asNumber !== null) return asNumber;
  }
  return trimmed;
}

export function formatConditionValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
}

/** Builds a condition for the chosen operator, carrying the value over when it still applies. */
export function changeOperator(condition: Condition, op: ConditionOp): Condition {
  const needsValue = OPERATORS.find((o) => o.op === op)!.needsValue;
  if (!needsValue) return { property: condition.property, op } as Condition;
  const text = 'value' in condition ? formatConditionValue(condition.value) : '';
  return { property: condition.property, op, value: parseConditionValue(op, text) } as Condition;
}
