import { z } from 'zod';
import { ruleSchema, ruleSetSchema, type Rule, type RuleSet } from './schema.ts';

export class RuleValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid rule definition:\n- ${issues.join('\n- ')}`);
    this.name = 'RuleValidationError';
    this.issues = issues;
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

export function parseRule(input: unknown): Rule {
  const result = ruleSchema.safeParse(input);
  if (!result.success) throw new RuleValidationError(formatIssues(result.error));
  return result.data;
}

export function parseRuleSet(input: unknown): RuleSet {
  const result = ruleSetSchema.safeParse(input);
  if (!result.success) throw new RuleValidationError(formatIssues(result.error));
  return result.data;
}
