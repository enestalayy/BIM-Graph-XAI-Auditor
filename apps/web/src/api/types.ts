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

export type CoverageStatus = 'violations' | 'compliant' | 'insufficient-data' | 'not-applicable';

export interface RuleOutcome {
  ruleId: string;
  violations: number;
  durationMs: number;
  coverage: { status: CoverageStatus; counts: Record<string, number> };
}

export interface LatestAudit {
  id: string;
  startedAt: string;
  durationMs: number;
  outcomes: RuleOutcome[];
}

export interface AuditSummary extends LatestAudit {
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

export type Verdict = 'agree' | 'disagree' | 'unsure';

export interface ReviewItem {
  index: number;
  ruleId: string;
  elements: string[];
  note: string;
  verdict: Verdict | null;
  comment: string;
  reviewedAt: string | null;
}

export interface Review {
  dataset: string;
  question: string;
  source: string;
  items: ReviewItem[];
  summary: { total: number; reviewed: number; agree: number; disagree: number; unsure: number; agreement: number | null };
}

export interface ElementDetail {
  ref: { globalId: string; ifcClass: string; name: string | null };
  properties: Record<string, unknown>;
  containers: string[];
  disciplines: string[];
}
