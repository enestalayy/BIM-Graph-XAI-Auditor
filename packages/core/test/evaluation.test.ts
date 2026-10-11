import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classificationMetrics, expectedViolationIds, goldStandardSchema, metricsByRule, summarizeExplanations, validateGrounding, type Explanation } from '../src/index.ts';

describe('classificationMetrics', () => {
  it('computes precision, recall and F1 from id sets', () => {
    const m = classificationMetrics(['R:a', 'R:b', 'R:c'], ['R:b', 'R:c', 'R:d', 'R:e']);
    assert.equal(m.truePositives, 2);
    assert.deepEqual(m.falsePositiveIds, ['R:a']);
    assert.deepEqual(m.falseNegativeIds, ['R:d', 'R:e']);
    assert.equal(m.precision, 2 / 3);
    assert.equal(m.recall, 0.5);
    assert.ok(Math.abs(m.f1 - 4 / 7) < 1e-12);
  });

  it('treats an empty prediction of an empty truth as perfect and ignores duplicates', () => {
    assert.equal(classificationMetrics([], []).f1, 1);
    assert.equal(classificationMetrics(['R:a', 'R:a'], ['R:a']).precision, 1);
  });

  it('gives F1 = 0 when nothing correct is found', () => {
    assert.equal(classificationMetrics(['R:x'], ['R:y']).f1, 0);
  });

  it('splits metrics by rule', () => {
    const byRule = metricsByRule(['A:1', 'B:1'], ['A:1', 'B:2']);
    assert.equal(byRule.A!.f1, 1);
    assert.equal(byRule.B!.f1, 0);
  });
});

describe('gold standard', () => {
  it('maps entries to the engine id scheme with sorted pairs', () => {
    const gold = goldStandardSchema.parse({
      dataset: 'd', annotator: 'a', createdAt: '2026-10-11', models: ['m.ifc'], ruleSet: 'rules/default.json',
      expected: [{ ruleId: 'FS-1', elements: ['wall', 'duct'] }, { ruleId: 'INFO-1', elements: ['w2'] }],
    });
    assert.deepEqual(expectedViolationIds(gold), ['FS-1:duct:wall', 'INFO-1:w2']);
  });

  it('rejects entries with more than two elements', () => {
    assert.throws(() => goldStandardSchema.parse({
      dataset: 'd', annotator: 'a', createdAt: 'x', models: ['m'], ruleSet: 'r', expected: [{ ruleId: 'R', elements: ['a', 'b', 'c'] }],
    }));
  });
});

describe('summarizeExplanations', () => {
  const facts = [{ id: 'F1', statement: 'Hacim 0,5 m³.' }];
  const explanation = (text: string, latencyMs: number): Explanation => ({
    id: text, violationId: 'v', method: 'm', text, facts, grounding: validateGrounding(text, facts), latencyMs, createdAt: '',
  });

  it('reports hallucination rate, means, format compliance and latency percentiles', () => {
    const summary = summarizeExplanations('m', [
      explanation('Bu bir hatadır çünkü hacim 0,5 m³ [F1].', 100),
      explanation('Hacim 9 m³ [F1].', 300),
    ]);
    assert.equal(summary.count, 2);
    assert.equal(summary.hallucinationRate, 0.5);
    assert.equal(summary.meanFaithfulness, 0.5);
    assert.equal(summary.formatCompliance, 0.5);
    assert.deepEqual(summary.latencyMs, { median: 100, p95: 300, max: 300 });
  });
});
