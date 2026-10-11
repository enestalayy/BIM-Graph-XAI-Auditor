import type { Violation } from '../api/types.ts';
import { sortViolations, type Severity } from './severity.ts';

export interface ViolationGroup {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly violations: readonly Violation[];
}

/** One group per rule, most severe first; inside a group the stable violation order is kept. */
export function groupByRule(violations: readonly Violation[]): ViolationGroup[] {
  const groups = new Map<string, Violation[]>();
  for (const v of sortViolations(violations)) groups.set(v.ruleId, [...(groups.get(v.ruleId) ?? []), v]);
  return [...groups.entries()].map(([ruleId, items]) => ({ ruleId, severity: items[0]!.severity, violations: items }));
}
