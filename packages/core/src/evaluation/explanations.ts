import type { Explanation } from '../explanation.ts';

export interface ExplanationSummary {
  readonly method: string;
  readonly count: number;
  /** Share of explanations with at least one unsupported entity. */
  readonly hallucinationRate: number;
  /** Over explanations that contain at least one checkable entity; null if none does. */
  readonly meanFaithfulness: number | null;
  /** Share of key evidence entities mentioned, averaged; null if not measured. */
  readonly meanCompleteness: number | null;
  /** Share of explanations without any checkable entity (nothing to verify, little to learn). */
  readonly emptyRate: number;
  readonly meanCitationCoverage: number;
  /** Share starting with the required "Bu bir hatadır çünkü". */
  readonly formatCompliance: number;
  readonly latencyMs: { readonly median: number; readonly p95: number; readonly max: number };
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);
const meanDefined = (values: readonly (number | null)[]): number | null => {
  const defined = values.filter((v): v is number => v !== null);
  return defined.length === 0 ? null : mean(defined);
};

/** Nearest-rank percentile. */
function percentile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

export function summarizeExplanations(method: string, explanations: readonly Explanation[]): ExplanationSummary {
  const latencies = explanations.map((x) => x.latencyMs);
  return {
    method,
    count: explanations.length,
    hallucinationRate: mean(explanations.map((x) => (x.grounding.hallucinated ? 1 : 0))),
    meanFaithfulness: meanDefined(explanations.map((x) => x.grounding.faithfulness)),
    meanCompleteness: meanDefined(explanations.map((x) => x.grounding.completeness ?? null)),
    emptyRate: mean(explanations.map((x) => (x.grounding.entityCount === 0 ? 1 : 0))),
    meanCitationCoverage: mean(explanations.map((x) => x.grounding.citationCoverage)),
    formatCompliance: mean(explanations.map((x) => (x.grounding.startsWithRequiredPhrase ? 1 : 0))),
    latencyMs: { median: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: Math.max(0, ...latencies) },
  };
}
