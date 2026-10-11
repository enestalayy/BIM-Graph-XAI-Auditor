import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';
import { isOfClass, type IfcModel } from '@bim/core';
import { InvalidIfcError, parseIfc } from '../src/index.ts';
import { loadSample } from './samples.ts';

const byGuid = (model: IfcModel, guid: string) => {
  const element = model.elements.find((e) => e.globalId === guid);
  assert.ok(element, `element ${guid} not found`);
  return element;
};

const approx = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

describe('parseIfc: HVAC sample', () => {
  let model: IfcModel;
  before(async () => { model = await loadSample('Building-Hvac.ifc', 'MEP'); });

  it('records the source schema and discipline', () => {
    assert.deepEqual(model.source, { fileName: 'Building-Hvac.ifc', schema: 'IFC4X3_ADD2', discipline: 'MEP' });
  });

  it('lists every element once even when a class is a subtype of another', () => {
    const terminals = model.elements.filter((e) => e.ifcClass === 'IfcAirTerminal');
    assert.equal(terminals.length, 2);
    const guids = model.elements.map((e) => e.globalId);
    assert.equal(new Set(guids).size, guids.length);
  });

  it('returns the duct box in metres in the Z-up IFC frame', () => {
    const duct = byGuid(model, '38WbwIGD90nB_3T2BTU5Ed');
    assert.equal(duct.ifcClass, 'IfcDuctSegment');
    assert.ok(duct.aabb);
    approx(duct.aabb.minX, 7.8); approx(duct.aabb.maxX, 8.0);
    approx(duct.aabb.minY, 7.85); approx(duct.aabb.maxY, 8.05);
    approx(duct.aabb.minZ, 0.9); approx(duct.aabb.maxZ, 4.7);
  });

  it('exposes the class hierarchy below IfcProduct', () => {
    const duct = byGuid(model, '38WbwIGD90nB_3T2BTU5Ed');
    assert.ok(isOfClass(duct, 'IfcFlowSegment'));
    assert.ok(isOfClass(duct, 'IfcElement'));
    assert.ok(!duct.ifcSuperClasses.includes('IfcProduct'));
  });
});

describe('parseIfc: architecture sample', () => {
  let model: IfcModel;
  before(async () => { model = await loadSample('Building-Architecture.ifc', 'ARCH'); });

  it('finds the four walls as physical elements with geometry', () => {
    const walls = model.elements.filter((e) => isOfClass(e, 'IfcWall'));
    assert.equal(walls.length, 4);
    for (const wall of walls) {
      assert.equal(wall.category, 'physical');
      assert.ok(wall.aabb, `${wall.globalId} has no box`);
    }
  });

  it('reads property sets with typed values', () => {
    const floor = byGuid(model, '3zR0BOEcLADRKln4HYporH');
    assert.equal(floor.properties['Pset_SlabCommon.FireRating'], 'REI30');
    assert.equal(floor.properties['Pset_SlabCommon.IsExternal'], true);
    assert.equal(floor.properties['Pset_SlabCommon.LoadBearing'], false);
  });

  it('reads associated materials', () => {
    assert.deepEqual(byGuid(model, '3zR0BOEcLADRKln4HYporH').materials, ['concrete_reinforced_in-situ']);
  });

  it('classifies spatial structure separately from physical elements', () => {
    const storey = byGuid(model, '1Ano2ZUxnEIvVQ_beukl8b');
    assert.equal(storey.ifcClass, 'IfcBuildingStorey');
    assert.equal(storey.category, 'spatial');
  });

  it('extracts containment and aggregation relations between products only', () => {
    assert.ok(model.relations.some((r) =>
      r.type === 'CONTAINED_IN' && r.from === '1uS5vfZPn9R8PlAaVd73on' && r.to === '1Ano2ZUxnEIvVQ_beukl8b'));
    assert.ok(model.relations.some((r) =>
      r.type === 'AGGREGATES' && r.from === '0c$N1CTon2BB2Sp89385G8' && r.to === '1Ano2ZUxnEIvVQ_beukl8b'));
    const guids = new Set(model.elements.map((e) => e.globalId));
    for (const r of model.relations) assert.ok(guids.has(r.from) && guids.has(r.to));
  });

  it('reports no warnings for a well-formed file', () => {
    assert.deepEqual(model.warnings, []);
  });
});

describe('parseIfc: invalid input', () => {
  it('rejects an empty file', async () => {
    await assert.rejects(parseIfc(new Uint8Array(), { fileName: 'empty.ifc', discipline: 'ARCH' }), InvalidIfcError);
  });

  it('rejects content that is not a STEP file', async () => {
    const junk = new TextEncoder().encode('PK\u0003\u0004 zipped or random bytes');
    await assert.rejects(parseIfc(junk, { fileName: 'junk.ifc', discipline: 'ARCH' }), /not an IFC STEP file/);
  });

  it('rejects a truncated STEP file with a readable error instead of crashing', async () => {
    const truncated = new TextEncoder().encode('ISO-10303-21;\nHEADER;\n');
    await assert.rejects(parseIfc(truncated, { fileName: 'truncated.ifc', discipline: 'ARCH' }), InvalidIfcError);
  });
});
