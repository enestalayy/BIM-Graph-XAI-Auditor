import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { findIntersections, isOfClass, type BoxedItem, type Element, type Intersection } from '@bim/core';
import { loadSample } from './samples.ts';

const DUCT = '38WbwIGD90nB_3T2BTU5Ed';
const ROOF_SLAB_RIGHT = '12UVOn4wvAJPMUExKdZLb8';

describe('intersections in the federated sample models', () => {
  let elements: Map<string, Element>;
  let hits: Intersection[];

  before(async () => {
    const models = [await loadSample('Building-Architecture.ifc', 'ARCH'), await loadSample('Building-Hvac.ifc', 'MEP')];
    elements = new Map(models.flatMap((m) => m.elements).map((e) => [e.globalId, e]));
    const boxed: BoxedItem[] = [...elements.values()]
      .filter((e) => e.category === 'physical' && e.aabb)
      .map((e) => ({ id: e.globalId, aabb: e.aabb! }));
    hits = findIntersections(boxed, 0.001);
  });

  const involving = (guid: string) => hits.filter((h) => h.a === guid || h.b === guid);

  it('finds the duct passing through the right roof slab', () => {
    const hit = involving(DUCT).find((h) => h.a === ROOF_SLAB_RIGHT || h.b === ROOF_SLAB_RIGHT);
    assert.ok(hit, 'duct x roof slab intersection expected');
    assert.ok(hit.volume > 0);
  });

  it('finds no intersection between the duct and any wall', () => {
    const wallHits = involving(DUCT).filter((h) => isOfClass(elements.get(h.a === DUCT ? h.b : h.a)!, 'IfcWall'));
    assert.deepEqual(wallHits, []);
  });
});
