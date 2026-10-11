import type { ViolationContext } from '@bim/core';
import type { Evidence } from './evidence.ts';
import type { TextGenerator } from './generator.ts';
import { buildPrompt } from './prompt.ts';

/** Produces the explanation text for one violation from its evidence. */
export interface Explainer {
  /** Recorded with the explanation: "template" or the generator id. */
  readonly method: string;
  explain(context: ViolationContext, evidence: Evidence): Promise<string>;
}

export function createLlmExplainer(generator: TextGenerator): Explainer {
  return {
    method: generator.id,
    explain: (context, evidence) => generator.generate(buildPrompt(context, evidence)),
  };
}
