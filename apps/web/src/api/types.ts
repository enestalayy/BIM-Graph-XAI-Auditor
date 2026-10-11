import type { Explanation, Rule, RuleInput, Violation, ViolationContext } from '@bim/core';

export type { Explanation, Rule, RuleInput, Violation, ViolationContext };
export type { Condition, ElementRef, Evidence, GroundingReport, Selector } from '@bim/core';

export interface ModelSummary {
  fileName: string;
  schema: string;
  discipline: string;
  ingestedAt: string;
  elementCount: number;
}

export interface IngestOutcome {
  fileName: string;
  discipline: string;
  schema: string;
  elements: number;
  relations: number;
  warnings: string[];
  intersections: number;
}

export interface Vocabulary {
  classes: string[];
  propertyKeys: string[];
}

export interface RuleSetInput {
  version: 1;
  rules: RuleInput[];
}

export interface AuditSummary {
  id: string;
  startedAt: string;
  durationMs: number;
  outcomes: { ruleId: string; violations: number; durationMs: number }[];
  violations: Violation[];
}

export interface ViolationDetail extends ViolationContext {
  explanations: Explanation[];
}

export type ExplainerKind = 'template' | 'ollama';
