import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { findIntersections, parseRuleSet, type Violation } from '@bim/core';
import { parseIfc } from '@bim/ifc';
import { ensureSchema, ingestModel, loadBoxedElements, replaceIntersections, runAudit, type GraphClient, type RuleOutcome } from '../../src/index.ts';
import { connectTestGraph, SKIP_REASON } from './graph-client.ts';

const ROOT = new URL('../../../../', import.meta.url);

describe('default rules on the buildingSMART sample models', { skip: SKIP_REASON }, () => {
  let graph: GraphClient;
  let violations: readonly Violation[];
  let outcomes: readonly RuleOutcome[];
  const ruleIds = (ruleId: string) => violations.filter((v) => v.ruleId === ruleId);

  before(async () => {
    graph = await connectTestGraph();
    await ensureSchema(graph);
    for (const [fileName, discipline] of [['Building-Architecture.ifc', 'ARCH'], ['Building-Hvac.ifc', 'MEP']] as const) {
      const data = await readFile(new URL(`data/sample/${fileName}`, ROOT));
      await ingestModel(graph, await parseIfc(new Uint8Array(data), { fileName, discipline }));
    }
    await replaceIntersections(graph, findIntersections(await loadBoxedElements(graph), 0.001), 0.001);
    const rules = parseRuleSet(JSON.parse(await readFile(new URL('rules/default.json', ROOT), 'utf8')));
    const audit = await runAudit(graph, rules.rules);
    violations = audit.violations;
    outcomes = audit.outcomes;
  });
  after(() => graph?.close());

  it('reports the four walls that have no FireRating', () => {
    assert.equal(ruleIds('INFO-WALL-01').length, 4);
  });

  it('reports no fire-damper violation because no wall or crossed slab is fire rated', () => {
    assert.equal(ruleIds('FS-DUCT-WALL-01').length, 0);
    assert.equal(ruleIds('FS-DUCT-SLAB-01').length, 0);
  });

  it('marks the wall damper rule as not checkable for lack of fire-rated walls rather than compliant', () => {
    const duct = outcomes.find((o) => o.ruleId === 'FS-DUCT-WALL-01')!;
    assert.equal(duct.coverage.status, 'insufficient-data');
    assert.deepEqual(duct.coverage.counts, { subjects: 1, objects: 0, objectClassMembers: 4, pairs: 0, mitigations: 0 });
  });

  it('reports the duct crossing the roof slab as a coordination clash', () => {
    const clashes = ruleIds('CLASH-MEP-STR-01');
    assert.deepEqual(clashes.map((v) => `${v.subject.ifcClass}>${v.object?.globalId}`), ['IfcDuctSegment>12UVOn4wvAJPMUExKdZLb8']);
  });
});
