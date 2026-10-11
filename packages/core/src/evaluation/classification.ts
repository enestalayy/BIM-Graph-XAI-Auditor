export interface ClassificationMetrics {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  /** TP / (TP + FP); 1 when nothing was predicted and nothing was expected. */
  readonly precision: number;
  /** TP / (TP + FN); 1 when nothing was expected. */
  readonly recall: number;
  readonly f1: number;
  readonly falsePositiveIds: readonly string[];
  readonly falseNegativeIds: readonly string[];
}

const ratio = (numerator: number, denominator: number): number => (denominator === 0 ? 1 : numerator / denominator);

/** Set-based detection metrics over deterministic violation ids ("ruleId:guid[:guid]"). */
export function classificationMetrics(predicted: Iterable<string>, expected: Iterable<string>): ClassificationMetrics {
  const p = new Set(predicted);
  const e = new Set(expected);
  const truePositives = [...p].filter((id) => e.has(id)).length;
  const falsePositiveIds = [...p].filter((id) => !e.has(id)).sort();
  const falseNegativeIds = [...e].filter((id) => !p.has(id)).sort();
  const precision = ratio(truePositives, truePositives + falsePositiveIds.length);
  const recall = ratio(truePositives, truePositives + falseNegativeIds.length);
  return {
    truePositives,
    falsePositives: falsePositiveIds.length,
    falseNegatives: falseNegativeIds.length,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
    falsePositiveIds,
    falseNegativeIds,
  };
}

/** Rule id of a violation id. */
export const ruleOf = (violationId: string): string => violationId.slice(0, violationId.indexOf(':'));

/** Metrics per rule, over the union of rules seen in predictions and expectations. */
export function metricsByRule(predicted: readonly string[], expected: readonly string[]): Record<string, ClassificationMetrics> {
  const rules = [...new Set([...predicted, ...expected].map(ruleOf))].sort();
  return Object.fromEntries(rules.map((rule) => [
    rule,
    classificationMetrics(predicted.filter((id) => ruleOf(id) === rule), expected.filter((id) => ruleOf(id) === rule)),
  ]));
}
