import type { Explanation } from '@bim/core';
import { loadViolationContext, saveExplanation, type CypherRunner } from '@bim/graph';
import { explainViolation, type Explainer } from '@bim/xai';
import { NotFoundError } from '../errors.ts';

export async function explainAndStore(graph: CypherRunner, violationId: string, explainer: Explainer): Promise<Explanation> {
  const context = await loadViolationContext(graph, violationId);
  if (!context) throw new NotFoundError(`Violation ${violationId} not found`);
  const explanation = await explainViolation(context, explainer);
  await saveExplanation(graph, explanation);
  return explanation;
}
