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

export type PropertyType = 'string' | 'number' | 'boolean' | 'mixed';

export interface Vocabulary {
  classes: string[];
  propertyKeys: string[];
  propertyTypes: Record<string, PropertyType>;
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

export interface DatasetFile {
  name: string;
  discipline: string;
}

export interface DatasetStatus {
  id: string;
  title: string;
  description: string;
  schema: string;
  license: string;
  attribution: string;
  sourceUrl: string;
  files: DatasetFile[];
  available: boolean;
  missingFiles: string[];
}

export interface DatasetList {
  active: string | null;
  datasets: DatasetStatus[];
}

export interface ActivationResult {
  datasetId: string;
  models: { fileName: string; discipline: string; elements: number; warnings: string[] }[];
  intersections: number;
  audit: AuditSummary;
  durationMs: number;
}
