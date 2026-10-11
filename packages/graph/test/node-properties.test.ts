import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Element } from '@bim/core';
import { elementLabels, toNodeProperties } from '../src/node-properties.ts';

const wall: Element = {
  globalId: 'W1', ifcClass: 'IfcWallStandardCase', ifcSuperClasses: ['IfcWall', 'IfcBuiltElement', 'IfcElement'],
  category: 'physical', name: 'Wall', predefinedType: null,
  properties: { 'Pset_WallCommon.FireRating': 'EI60' }, materials: ['brick'],
  aabb: { minX: 0, minY: 0, minZ: 0, maxX: 4, maxY: 0.2, maxZ: 3 },
};

describe('toNodeProperties', () => {
  it('flattens box and property sets next to the fixed keys', () => {
    const props = toNodeProperties(wall);
    assert.equal(props['Pset_WallCommon.FireRating'], 'EI60');
    assert.equal(props.maxX, 4);
    assert.equal(props.ifcClass, 'IfcWallStandardCase');
  });

  it('writes null box coordinates for elements without geometry so stale values are removed', () => {
    assert.equal(toNodeProperties({ ...wall, aabb: null }).minX, null);
  });

  it('does not let a property set override a fixed key', () => {
    const props = toNodeProperties({ ...wall, properties: { globalId: 'FAKE' } });
    assert.equal(props.globalId, 'W1');
  });
});

describe('elementLabels', () => {
  it('labels an element with its class and every ancestor', () => {
    assert.deepEqual(elementLabels(wall), ['Element', 'IfcWallStandardCase', 'IfcWall', 'IfcBuiltElement', 'IfcElement']);
  });
});
