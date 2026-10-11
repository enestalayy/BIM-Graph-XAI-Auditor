import {
  classificationMetrics, expectedViolationIds, metricsByRule, summarizeExplanations,
  type ClassificationMetrics, type Explanation, type ExplanationSummary, type GoldStandard, type RuleSet,
} from '@bim/core';
import { ensureSchema, ingestModel, loadViolations, runAudit, type GraphWriter } from '@bim/graph';
import type { Explainer } from '@bim/xai';
import { explainAndStore } from '../services/explain.ts';
import { refreshIntersections } from '../services/ingest.ts';
import { generateInjectionScenario, type CaseKind } from './fault-injection.ts';

export interface InjectionRun {
  readonly seed: number;
  readonly cases: number;
  readonly casesByKind: Partial<Record<CaseKind, number>>;
  readonly metrics: ClassificationMetrics;
  readonly ingestMs: number;
  readonly intersectionMs: number;
  readonly auditMs: number;
}

export interface InjectionReport {
  readonly ruleId: string;
  readonly tolerance: number;
  readonly runs: readonly InjectionRun[];
  /** Micro-averaged over all runs. */
  readonly total: ClassificationMetrics;
}

/**
 * Runs the fault-injection experiment. The graph is WIPED before every seed,
 * so this must only be pointed at a disposable database.
 */
export async function runInjectionExperiment(
  graph: GraphWriter, ruleSet: RuleSet, seeds: readonly number[], caseCount: number, tolerance: number, ruleId = 'FS-DUCT-WALL-01',
): Promise<InjectionReport> {
  const rule = ruleSet.rules.find((r) => r.id === ruleId);
  if (!rule) throw new Error(`Rule ${ruleId} is not in the rule set`);
  const runs: InjectionRun[] = [];
  const predictedAll: string[] = [];
  const expectedAll: string[] = [];

  for (const seed of seeds) {
    const scenario = generateInjectionScenario(seed, caseCount, ruleId);
    await graph.run('MATCH (n) DETACH DELETE n');
    await ensureSchema(graph);
    let t = performance.now();
    for (const model of scenario.models) await ingestModel(graph, model);
    const ingestMs = performance.now() - t;
    t = performance.now();
    await refreshIntersections(graph, tolerance);
    const intersectionMs = performance.now() - t;
    t = performance.now();
    const audit = await runAudit(graph, [{ ...rule, enabled: true }]);
    const auditMs = performance.now() - t;

    const predicted = audit.violations.map((v) => v.id);
    predictedAll.push(...predicted.map((id) => `${seed}|${id}`));
    expectedAll.push(...scenario.expected.map((id) => `${seed}|${id}`));
    const casesByKind: Partial<Record<CaseKind, number>> = {};
    for (const c of scenario.cases) casesByKind[c.kind] = (casesByKind[c.kind] ?? 0) + 1;
    runs.push({ seed, cases: caseCount, casesByKind, metrics: classificationMetrics(predicted, scenario.expected), ingestMs, intersectionMs, auditMs });
  }
  return { ruleId, tolerance, runs, total: classificationMetrics(predictedAll, expectedAll) };
}

export interface GoldReport {
  readonly dataset: string;
  readonly total: ClassificationMetrics;
  readonly byRule: Record<string, ClassificationMetrics>;
  readonly auditMs: number;
}

/** Compares a fresh audit of the current graph with an expert gold standard. */
export async function evaluateAgainstGold(graph: GraphWriter, ruleSet: RuleSet, gold: GoldStandard): Promise<GoldReport> {
  const audit = await runAudit(graph, ruleSet.rules);
  const predicted = audit.violations.map((v) => v.id);
  const expected = expectedViolationIds(gold);
  return { dataset: gold.dataset, total: classificationMetrics(predicted, expected), byRule: metricsByRule(predicted, expected), auditMs: audit.durationMs };
}

export interface ExplanationReport {
  readonly summary: ExplanationSummary;
  readonly explanations: readonly Explanation[];
}

/** Explains every current violation (or the first `limit`) with one explainer and summarises grounding. */
export async function evaluateExplanations(graph: GraphWriter, explainer: Explainer, limit?: number): Promise<ExplanationReport> {
  const violations = (await loadViolations(graph)).slice(0, limit);
  const explanations: Explanation[] = [];
  for (const violation of violations) explanations.push(await explainAndStore(graph, violation.id, explainer));
  return { summary: summarizeExplanations(explainer.method, explanations), explanations };
}
