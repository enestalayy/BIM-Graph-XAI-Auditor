import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import { findIntersections, type IfcModel } from '@bim/core';
import { parseIfc } from '@bim/ifc';
import { ensureSchema, ingestModel, listModels, loadBoxedElements, loadVocabulary, replaceIntersections, type GraphClient } from '../../src/index.ts';
import { connectTestGraph, SKIP_REASON } from './graph-client.ts';

const SAMPLE_DIR = new URL('../../../../data/sample/', import.meta.url);
const load = async (fileName: string, discipline: string): Promise<IfcModel> =>
  parseIfc(new Uint8Array(await readFile(new URL(fileName, SAMPLE_DIR))), { fileName, discipline });

describe('federated ingest into Neo4j', { skip: SKIP_REASON }, () => {
  let graph: GraphClient;
  let arch: IfcModel;
  let mep: IfcModel;
  const count = async (cypher: string): Promise<number> => Number((await graph.run(cypher))[0]?.n);

  before(async () => {
    graph = await connectTestGraph();
    await ensureSchema(graph);
    [arch, mep] = [await load('Building-Architecture.ifc', 'ARCH'), await load('Building-Hvac.ifc', 'MEP')];
    await ingestModel(graph, arch);
    await ingestModel(graph, mep);
  });
  after(() => graph?.close());

  it('merges elements shared by both models into one node linked to both models', async () => {
    const unique = new Set([...arch.elements, ...mep.elements].map((e) => e.globalId)).size;
    assert.equal(await count('MATCH (e:Element) RETURN count(e) AS n'), unique);
    const storeyModels = await count(`MATCH (:Element {globalId: '1Ano2ZUxnEIvVQ_beukl8b'})-[:FROM_MODEL]->(m:Model) RETURN count(m) AS n`);
    assert.equal(storeyModels, 2);
  });

  it('labels elements with their class hierarchy and keeps property sets queryable', async () => {
    assert.equal(await count('MATCH (w:IfcWall) RETURN count(w) AS n'), 4);
    const rating = await graph.run("MATCH (s:IfcSlab {globalId: '3zR0BOEcLADRKln4HYporH'}) RETURN s.`Pset_SlabCommon.FireRating` AS r");
    assert.equal(rating[0]?.r, 'REI30');
  });

  it('creates topology relations from both models', async () => {
    assert.equal(await count(`MATCH (:IfcDuctSegment)-[:CONTAINED_IN]->(:IfcBuildingStorey) RETURN count(*) AS n`), 1);
    assert.equal(await count(`MATCH (:IfcBuilding)-[:AGGREGATES]->(:IfcBuildingStorey) RETURN count(*) AS n`), 1);
  });

  it('lists the ingested models with their element counts', async () => {
    const models = await listModels(graph);
    assert.deepEqual(models.map((m) => [m.fileName, m.discipline, m.elementCount]), [
      ['Building-Architecture.ifc', 'ARCH', arch.elements.length],
      ['Building-Hvac.ifc', 'MEP', mep.elements.length],
    ]);
  });

  it('exposes the classes and property keys that rule authors can use', async () => {
    const vocabulary = await loadVocabulary(graph);
    for (const c of ['IfcWall', 'IfcDuctSegment', 'IfcFlowSegment', 'IfcElement']) assert.ok(vocabulary.classes.includes(c), c);
    assert.ok(vocabulary.propertyKeys.includes('Pset_SlabCommon.FireRating'));
    assert.ok(!vocabulary.propertyKeys.includes('globalId'));
  });

  it('is idempotent when a model is ingested again', async () => {
    const before = await count('MATCH (n) RETURN count(n) AS n');
    const relsBefore = await count('MATCH ()-[r]->() RETURN count(r) AS n');
    await ingestModel(graph, mep);
    assert.equal(await count('MATCH (n) RETURN count(n) AS n'), before);
    assert.equal(await count('MATCH ()-[r]->() RETURN count(r) AS n'), relsBefore);
  });

  it('stores intersections computed over the federated graph', async () => {
    const hits = findIntersections(await loadBoxedElements(graph), 0.001);
    await replaceIntersections(graph, hits, 0.001);
    assert.equal(await count('MATCH ()-[r:INTERSECTS_WITH]->() RETURN count(r) AS n'), hits.length);
    const duct = await graph.run(
      `MATCH (:IfcDuctSegment)-[r:INTERSECTS_WITH]-(:IfcSlab {globalId: '12UVOn4wvAJPMUExKdZLb8'}) RETURN r.volume AS v`);
    assert.equal(duct.length, 1);
    assert.ok(Number(duct[0]?.v) > 0);
  });
});
