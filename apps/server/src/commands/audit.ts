import { auditGraph } from '../services/audit.ts';
import { createFileRuleRepository } from '../services/rule-repository.ts';
import type { Command } from './command.ts';

export const audit: Command = async ({ graph, config }) => {
  const result = await auditGraph(graph, await createFileRuleRepository(config.rulesFile).load());
  console.table(result.outcomes.map((o) => ({ rule: o.ruleId, violations: o.violations, ms: Number(o.durationMs.toFixed(1)) })));
  console.log(`Audit ${result.id}: ${result.violations.length} violations in ${result.durationMs.toFixed(1)} ms`);
};
