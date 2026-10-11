import type { Violation } from '../api/types.ts';

export type Severity = Violation['severity'];

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { critical: 'Kritik', major: 'Majör', minor: 'Minör' };
const ORDER: Readonly<Record<Severity, number>> = { critical: 0, major: 1, minor: 2 };

/** Most severe first, then by rule and id, so the list is stable between audits. */
export function sortViolations(violations: readonly Violation[]): Violation[] {
  return [...violations].sort((a, b) =>
    ORDER[a.severity] - ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId) || a.id.localeCompare(b.id));
}

export function countBySeverity(violations: readonly Violation[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, major: 0, minor: 0 };
  for (const v of violations) counts[v.severity]++;
  return counts;
}
