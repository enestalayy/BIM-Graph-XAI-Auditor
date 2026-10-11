import type { RuleSet } from '@bim/core';
import { runAudit, saveAudit, type AuditResult, type CypherRunner } from '@bim/graph';

/** Runs every enabled rule and stores the findings as the current audit. */
export async function auditGraph(graph: CypherRunner, ruleSet: RuleSet): Promise<AuditResult> {
  const audit = await runAudit(graph, ruleSet.rules);
  await saveAudit(graph, ruleSet.rules, audit);
  return audit;
}
