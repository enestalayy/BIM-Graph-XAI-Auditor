import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { findIntersections, parseRuleSet, validateGrounding, type Aabb, type Element, type IfcModel, type RuleSet, type Violation } from '@bim/core';
import {
  ensureSchema, ingestModel, loadBoxedElements, loadExplanations, loadViolationContext, loadViolations, replaceIntersections,
  loadLatestAudit, runAudit, saveAudit, saveExplanation, type GraphClient,
} from '../../src/index.ts';
import { connectTestGraph, SKIP_REASON } from './graph-client.ts';

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb =>
  ({ minX, minY, minZ, maxX, maxY, maxZ });

const BUILT = ['IfcBuiltElement', 'IfcElement'];
const DISTRIBUTION = ['IfcFlowSegment', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement'];
const CONTROLLER = ['IfcFlowController', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement'];

function element(globalId: string, ifcClass: string, ifcSuperClasses: string[], aabb: Aabb, extra: Partial<Element> = {}): Element {
  return { globalId, ifcClass, ifcSuperClasses, category: 'physical', name: globalId, predefinedType: null, properties: {}, materials: [], aabb, ...extra };
}

/**
 * A fire wall (x 0..4) crossed by two ducts: duct-ok has a fire damper at the crossing,
 * duct-bad has none (the only fire damper is ~2 m away; a blast damper sits right next to it).
 * A plain wall without FireRating (x 10..14) is crossed by duct-plain.
 */
const ARCH: IfcModel = {
  source: { fileName: 'synthetic-arch.ifc', schema: 'IFC4', discipline: 'ARCH' },
  elements: [
    element('fire-wall', 'IfcWall', BUILT, box(0, 0, 0, 4, 0.2, 3), { properties: { 'Pset_WallCommon.FireRating': 'EI60' } }),
    element('plain-wall', 'IfcWall', BUILT, box(10, 0, 0, 14, 0.2, 3)),
  ],
  relations: [],
  warnings: [],
};
const MEP: IfcModel = {
  source: { fileName: 'synthetic-mep.ifc', schema: 'IFC4', discipline: 'MEP' },
  elements: [
    element('duct-ok', 'IfcDuctSegment', DISTRIBUTION, box(0.9, -1, 1, 1.1, 1, 1.2)),
    element('damper-fire', 'IfcDamper', CONTROLLER, box(0.9, -0.1, 1, 1.1, 0.3, 1.2), { predefinedType: 'FIREDAMPER' }),
    element('duct-bad', 'IfcDuctSegment', DISTRIBUTION, box(2.9, -1, 1, 3.1, 1, 1.2)),
    element('damper-blast', 'IfcDamper', CONTROLLER, box(2.9, 0.25, 1, 3.1, 0.5, 1.2), { predefinedType: 'BLASTDAMPER' }),
    element('duct-plain', 'IfcDuctSegment', DISTRIBUTION, box(11, -1, 1, 11.2, 1, 1.2)),
  ],
  relations: [],
  warnings: [],
};

describe('rule audit on a synthetic federated graph', { skip: SKIP_REASON }, () => {
  let graph: GraphClient;
  let rules: RuleSet;
  let violations: Violation[];
  const ofRule = (ruleId: string) => violations.filter((v) => v.ruleId === ruleId);

  before(async () => {
    graph = await connectTestGraph();
    await ensureSchema(graph);
    await ingestModel(graph, ARCH);
    await ingestModel(graph, MEP);
    await replaceIntersections(graph, findIntersections(await loadBoxedElements(graph), 0.001), 0.001);
    rules = parseRuleSet(JSON.parse(await readFile(new URL('../../../../rules/default.json', import.meta.url), 'utf8')));
    const audit = await runAudit(graph, rules.rules);
    await saveAudit(graph, rules.rules, audit);
    violations = await loadViolations(graph);
  });
  after(() => graph?.close());

  it('reports what each rule examined', async () => {
    const audit = await loadLatestAudit(graph);
    const duct = audit!.outcomes.find((o) => o.ruleId === 'FS-DUCT-WALL-01')!;
    assert.equal(duct.coverage.status, 'violations');
    assert.deepEqual(duct.coverage.counts, { subjects: 3, objects: 1, objectClassMembers: 2, pairs: 2, mitigations: 1 });
    const wall = audit!.outcomes.find((o) => o.ruleId === 'INFO-WALL-01')!;
    assert.deepEqual(wall.coverage.counts, { targets: 2, targetClassMembers: 2 });
    const pipe = audit!.outcomes.find((o) => o.ruleId === 'FS-PIPE-WALL-01')!;
    assert.equal(pipe.coverage.status, 'not-applicable'); // no pipes in the model
  });

  it('property rule: flags only the wall without FireRating', () => {
    assert.deepEqual(ofRule('INFO-WALL-01').map((v) => v.subject.globalId), ['plain-wall']);
  });

  it('intersection rule: a duct through a fire wall without a nearby fire damper is a violation', () => {
    const found = ofRule('FS-DUCT-WALL-01');
    assert.deepEqual(found.map((v) => v.subject.globalId), ['duct-bad']);
    const evidence = found[0]!.evidence;
    assert.ok(evidence.kind === 'intersection' && evidence.mitigation);
    assert.equal(evidence.mitigation.nearest?.globalId, 'damper-fire', 'the blast damper must not count as mitigation');
    assert.ok(evidence.mitigation.nearest!.distance > 0.5);
    assert.ok(Math.abs(evidence.intersection.volume - 0.2 * 0.2 * 0.2) < 1e-9);
  });

  it('intersection rule: walls without FireRating are not treated as fire walls', () => {
    assert.ok(!ofRule('FS-DUCT-WALL-01').some((v) => v.object?.globalId === 'plain-wall'));
  });

  it('generic clash rule reports flow segments crossing built elements, not embedded fittings', () => {
    const pairs = ofRule('CLASH-MEP-STR-01').map((v) => `${v.subject.globalId}>${v.object?.globalId}`).sort();
    assert.deepEqual(pairs, ['duct-bad>fire-wall', 'duct-ok>fire-wall', 'duct-plain>plain-wall']);
  });

  it('persists violations linked to their rule and elements, with the compiled query on the rule', async () => {
    const rows = await graph.run(
      `MATCH (v:Violation {id: 'FS-DUCT-WALL-01:duct-bad:fire-wall'})-[:OF_RULE]->(r:Rule),
             (v)-[:INVOLVES {role: 'subject'}]->(s), (v)-[:INVOLVES {role: 'object'}]->(o)
       RETURN r.cypher AS cypher, s.globalId AS s, o.globalId AS o`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.s, 'duct-bad');
    assert.match(String(rows[0]?.cypher), /INTERSECTS_WITH/);
  });

  it('retrieves the context of a violation: rule definition, involved elements, their properties and models', async () => {
    const context = await loadViolationContext(graph, 'FS-DUCT-WALL-01:duct-bad:fire-wall');
    assert.ok(context);
    assert.equal(context.rule.id, 'FS-DUCT-WALL-01');
    assert.deepEqual(Object.keys(context.elements).sort(), ['damper-fire', 'duct-bad', 'fire-wall']);
    assert.equal(context.elements['fire-wall']!.properties['Pset_WallCommon.FireRating'], 'EI60');
    assert.deepEqual(context.elements['duct-bad']!.disciplines, ['MEP']);
    assert.equal(await loadViolationContext(graph, 'does-not-exist'), null);
  });

  it('stores explanations linked to their violation', async () => {
    const facts = [{ id: 'F1', statement: 'Kural FS-DUCT-WALL-01.' }];
    const text = 'Bu bir hatadır çünkü FS-DUCT-WALL-01 sağlanmıyor [F1].';
    await saveExplanation(graph, {
      id: 'x-1', violationId: 'FS-DUCT-WALL-01:duct-bad:fire-wall', method: 'template', text, facts,
      grounding: validateGrounding(text, facts), latencyMs: 1, createdAt: new Date().toISOString(),
    });
    const [stored] = await loadExplanations(graph, 'FS-DUCT-WALL-01:duct-bad:fire-wall');
    assert.equal(stored?.text, text);
    assert.equal(stored?.grounding.faithfulness, 1);
    await assert.rejects(saveExplanation(graph, { ...stored!, id: 'x-2', violationId: 'missing' }), /not found/);
  });

  it('keeps the explanations of findings that persist across audits', async () => {
    await saveAudit(graph, rules.rules, await runAudit(graph, rules.rules));
    const kept = await loadExplanations(graph, 'FS-DUCT-WALL-01:duct-bad:fire-wall');
    assert.equal(kept.length, 1);
  });

  it('removes findings (and their explanations) that disappear in a later audit', async () => {
    const onlyInfo = rules.rules.filter((r) => r.id === 'INFO-WALL-01');
    await saveAudit(graph, onlyInfo, await runAudit(graph, onlyInfo));
    assert.deepEqual((await loadViolations(graph)).map((v) => v.ruleId), ['INFO-WALL-01']);
    const orphans = await graph.run('MATCH (x:Explanation) WHERE NOT (x)-[:EXPLAINS]->() RETURN count(x) AS n');
    assert.equal(Number(orphans[0]?.n), 0);
    await saveAudit(graph, rules.rules, await runAudit(graph, rules.rules));
  });

  it('replaces the findings of the previous audit when run again', async () => {
    await saveAudit(graph, rules.rules, await runAudit(graph, rules.rules));
    assert.equal((await loadViolations(graph)).length, violations.length);
    const audits = await graph.run('MATCH (a:Audit) RETURN count(a) AS n');
    assert.equal(Number(audits[0]?.n), 5);
  });
});
