import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { parseRuleSet, type RuleSet } from '@bim/core';
import { connectGraph, readDisposableGraphConfig, type GraphClient } from '@bim/graph';
import { runInjectionExperiment } from '../../src/evaluation/experiments.ts';

const SKIP = process.env.NEO4J_TEST_URI ? false : 'NEO4J_TEST_URI is not set (docker compose --profile test up -d neo4j-test)';

describe('fault-injection experiment', { skip: SKIP }, () => {
  let graph: GraphClient;
  let rules: RuleSet;

  before(async () => {
    graph = await connectGraph(readDisposableGraphConfig());
    rules = parseRuleSet(JSON.parse(await readFile(new URL('../../../../rules/default.json', import.meta.url), 'utf8')));
  });
  after(() => graph?.close());

  it('finds exactly the injected violations', async () => {
    const report = await runInjectionExperiment(graph, rules, [11, 12], 30, 0.001);
    assert.equal(report.runs.length, 2);
    assert.equal(report.total.falsePositives, 0, report.total.falsePositiveIds.join(', '));
    assert.equal(report.total.falseNegatives, 0, report.total.falseNegativeIds.join(', '));
    assert.ok(report.total.truePositives > 0);
  });

  it('refuses an unknown rule id', async () => {
    await assert.rejects(runInjectionExperiment(graph, rules, [1], 5, 0.001, 'NOPE'), /not in the rule set/);
  });
});
