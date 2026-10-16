import { randomUUID } from 'node:crypto';
import {
  compileCoverage, compileRule, coverageStatus, toViolations,
  type CoverageCounts, type CoverageStatus, type Rule, type Violation,
} from '@bim/core';
import type { CypherRunner } from './client.ts';

export interface RuleOutcome {
  readonly ruleId: string;
  readonly violations: number;
  readonly durationMs: number;
  /** What the rule examined, and whether "no violation" means compliant or not checkable. */
  readonly coverage: { readonly status: CoverageStatus; readonly counts: CoverageCounts };
}

export interface AuditResult {
  readonly id: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly outcomes: readonly RuleOutcome[];
  readonly violations: readonly Violation[];
}

/** Evaluates every enabled rule against the graph. Read-only; see saveAudit for persistence. */
export async function runAudit(runner: CypherRunner, rules: readonly Rule[]): Promise<AuditResult> {
  const startedAt = new Date().toISOString();
  const auditStart = performance.now();
  const outcomes: RuleOutcome[] = [];
  const violations: Violation[] = [];
  for (const rule of rules.filter((r) => r.enabled)) {
    const ruleStart = performance.now();
    const { cypher, params } = compileRule(rule);
    const found = toViolations(rule, await runner.run(cypher, params));
    const durationMs = performance.now() - ruleStart;
    const coverageQuery = compileCoverage(rule);
    const [row] = await runner.run(coverageQuery.cypher, coverageQuery.params);
    const counts = Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, Number(v)])) as unknown as CoverageCounts;
    outcomes.push({
      ruleId: rule.id,
      violations: found.length,
      durationMs,
      coverage: { status: coverageStatus(rule, counts, found.length), counts },
    });
    violations.push(...found);
  }
  return { id: randomUUID(), startedAt, durationMs: performance.now() - auditStart, outcomes, violations };
}
