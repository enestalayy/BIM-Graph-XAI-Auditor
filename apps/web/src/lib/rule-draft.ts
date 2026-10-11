import type { Condition, PropertyType, RuleInput } from '../api/types.ts';

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

const toNumber = (text: string): number => (text === '' ? Number.NaN : Number(text.replace(',', '.')));

/**
 * Interprets the text typed into a condition's value box using the type the
 * property actually has in the model (from the vocabulary). IFC labels such as
 * FireRating are strings even when they look numeric, so text stays text unless
 * the property is known to be numeric or boolean. Comparison operators always take numbers.
 */
export function parseConditionValue(op: ConditionOp, text: string, type?: PropertyType): string | number | boolean | (string | number)[] {
  const trimmed = text.trim();
  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') return toNumber(trimmed);
  if (op === 'in') {
    const items = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    return type === 'number' ? items.map(toNumber) : items;
  }
  if (op === 'eq' || op === 'neq') {
    if (type === 'number') return toNumber(trimmed);
    if (type === 'boolean' || (type === undefined && (trimmed === 'true' || trimmed === 'false'))) return trimmed === 'true';
  }
  return trimmed;
}

export function formatConditionValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null) return '';
  return String(value);
}

/** Builds a condition for the chosen operator, carrying the value over when it still applies. */
export function changeOperator(condition: Condition, op: ConditionOp, type?: PropertyType): Condition {
  const needsValue = OPERATORS.find((o) => o.op === op)!.needsValue;
  if (!needsValue) return { property: condition.property, op } as Condition;
  const text = 'value' in condition ? formatConditionValue(condition.value) : '';
  return { property: condition.property, op, value: parseConditionValue(op, text, type) } as Condition;
}
