import { randomUUID } from 'node:crypto';
import { compileRule, toViolations, type Rule, type Violation } from '@bim/core';
import type { CypherRunner } from './client.ts';

export interface RuleOutcome {
  readonly ruleId: string;
  readonly violations: number;
  readonly durationMs: number;
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
    outcomes.push({ ruleId: rule.id, violations: found.length, durationMs: performance.now() - ruleStart });
    violations.push(...found);
  }
  return { id: randomUUID(), startedAt, durationMs: performance.now() - auditStart, outcomes, violations };
}
