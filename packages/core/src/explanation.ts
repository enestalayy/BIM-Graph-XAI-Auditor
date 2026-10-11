import type { EvidenceFact, GroundingReport } from './grounding/validate.ts';
import type { Rule } from './rules/schema.ts';
import type { ElementRef, Violation } from './rules/violation.ts';

/** What the graph knows about an element involved in a violation. */
export interface ElementContext {
  readonly ref: ElementRef;
  /** Node properties as stored in the graph (fixed keys and "<Pset>.<Property>" keys). */
  readonly properties: Readonly<Record<string, unknown>>;
  /** Names of the spatial structures the element is contained in (storey, space). */
  readonly containers: readonly string[];
  readonly disciplines: readonly string[];
}

/** Everything an explainer may use: the finding, its rule and the involved elements. Nothing else. */
export interface ViolationContext {
  readonly violation: Violation;
  readonly rule: Rule;
  readonly elements: Readonly<Record<string, ElementContext>>;
}

export interface Explanation {
  readonly id: string;
  readonly violationId: string;
  /** "template" or "<provider>:<model>", e.g. "ollama:llama3.1:8b". */
  readonly method: string;
  readonly text: string;
  readonly facts: readonly EvidenceFact[];
  readonly grounding: GroundingReport;
  readonly latencyMs: number;
  readonly createdAt: string;
}
