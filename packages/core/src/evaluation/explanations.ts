import type { Explanation } from '../explanation.ts';

export interface ExplanationSummary {
  readonly method: string;
  readonly count: number;
  /** Share of explanations with at least one unsupported entity. */
  readonly hallucinationRate: number;
  readonly meanFaithfulness: number;
  readonly meanCitationCoverage: number;
  /** Share starting with the required "Bu bir hatadır çünkü". */
  readonly formatCompliance: number;
  readonly latencyMs: { readonly median: number; readonly p95: number; readonly max: number };
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length);

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
    meanFaithfulness: mean(explanations.map((x) => x.grounding.faithfulness)),
    meanCitationCoverage: mean(explanations.map((x) => x.grounding.citationCoverage)),
    formatCompliance: mean(explanations.map((x) => (x.grounding.startsWithRequiredPhrase ? 1 : 0))),
    latencyMs: { median: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), max: Math.max(0, ...latencies) },
  };
}
