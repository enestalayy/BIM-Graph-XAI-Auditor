import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertIfcClassName, quoteIdentifier } from '../src/index.ts';

describe('Cypher identifier guards', () => {
  it('accepts IFC class names', () => {
    assert.equal(assertIfcClassName('IfcWallStandardCase'), 'IfcWallStandardCase');
  });

  it('rejects anything that could break out of a label position', () => {
    for (const bad of ['Wall', 'IfcWall`) DETACH DELETE n //', 'Ifc Wall', '']) {
      assert.throws(() => assertIfcClassName(bad), /Invalid IFC class name/);
    }
  });

  it('quotes property keys with dots and spaces and escapes backticks', () => {
    assert.equal(quoteIdentifier('Pset_WallCommon.FireRating'), '`Pset_WallCommon.FireRating`');
    assert.equal(quoteIdentifier('a`b'), '`a``b`');
  });
});
