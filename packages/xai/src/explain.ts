import { randomUUID } from 'node:crypto';
import { validateGrounding, type Explanation, type ViolationContext } from '@bim/core';
import { buildEvidence } from './evidence.ts';
import type { Explainer } from './explainer.ts';

/** Explains one violation and measures how well the text is grounded in the evidence it was given. */
export async function explainViolation(context: ViolationContext, explainer: Explainer): Promise<Explanation> {
  const evidence = buildEvidence(context);
  const started = performance.now();
  const text = (await explainer.explain(context, evidence)).trim();
  const latencyMs = performance.now() - started;
  if (text.length === 0) throw new Error(`${explainer.method} produced an empty explanation for ${context.violation.id}`);
  return {
    id: randomUUID(),
    violationId: context.violation.id,
    method: explainer.method,
    text,
    facts: evidence.facts,
    grounding: validateGrounding(text, evidence.facts),
    latencyMs,
    createdAt: new Date().toISOString(),
  };
}
