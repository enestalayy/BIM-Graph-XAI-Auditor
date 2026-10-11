import type { RuleSet } from '@bim/core';
import { runAudit, saveAudit, type AuditResult, type GraphWriter } from '@bim/graph';

/** Runs every enabled rule and stores the findings as the current audit. */
export async function auditGraph(graph: GraphWriter, ruleSet: RuleSet): Promise<AuditResult> {
  const audit = await runAudit(graph, ruleSet.rules);
  await saveAudit(graph, ruleSet.rules, audit);
  return audit;
}
