import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { IfcModel } from '@bim/core';
import { clearProjectData, ensureSchema, getActiveDataset, ingestModel, setActiveDataset, type GraphClient } from '../../src/index.ts';
import { connectTestGraph, SKIP_REASON } from './graph-client.ts';

const MODEL: IfcModel = {
  source: { fileName: 'w.ifc', schema: 'IFC4', discipline: 'ARCH' },
  elements: [{ globalId: 'w1', ifcClass: 'IfcWall', ifcSuperClasses: ['IfcElement'], category: 'physical', name: null, predefinedType: null, properties: {}, materials: [], aabb: null }],
  relations: [],
  warnings: [],
};

describe('workspace', { skip: SKIP_REASON }, () => {
  let graph: GraphClient;
  before(async () => {
    graph = await connectTestGraph();
    await ensureSchema(graph);
  });
  after(() => graph?.close());

  it('records the active dataset', async () => {
    assert.equal(await getActiveDataset(graph), null);
    await setActiveDataset(graph, 'duplex');
    assert.equal(await getActiveDataset(graph), 'duplex');
  });

  it('clears project data but keeps rules', async () => {
    await ingestModel(graph, MODEL);
    await graph.run("MERGE (:Rule {id: 'R-1'})");
    await clearProjectData(graph);
    const [counts] = await graph.run('MATCH (e:Element) WITH count(e) AS e MATCH (r:Rule) RETURN e, count(r) AS r');
    assert.equal(Number(counts?.e), 0);
    assert.equal(Number(counts?.r), 1);
  });
});
