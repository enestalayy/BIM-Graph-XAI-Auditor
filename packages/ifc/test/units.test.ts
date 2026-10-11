import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { siUnitScale } from '../src/units.ts';
import { toPropertyValue } from '../src/properties.ts';
import { toIfcFrame } from '../src/frame.ts';

describe('siUnitScale', () => {
  it('applies the prefix once per dimension', () => {
    assert.equal(siUnitScale('LENGTHUNIT', 'MILLI'), 1e-3);
    assert.equal(siUnitScale('AREAUNIT', 'MILLI'), 1e-3 ** 2);
    assert.equal(siUnitScale('VOLUMEUNIT', 'CENTI'), 1e-2 ** 3);
  });

  it('is 1 for unprefixed units', () => {
    assert.equal(siUnitScale('LENGTHUNIT', null), 1);
  });

  it('rejects unknown prefixes instead of guessing', () => {
    assert.throws(() => siUnitScale('LENGTHUNIT', 'BOGUS'), /Unknown SI prefix/);
  });
});

describe('toPropertyValue', () => {
  const mm = { length: 1e-3, area: 1, volume: 1 };

  it('converts length measures to metres', () => {
    assert.equal(toPropertyValue({ name: 'IFCLENGTHMEASURE', value: 200 }, mm), 0.2);
  });

  it('keeps labels and maps logicals to booleans', () => {
    assert.equal(toPropertyValue({ name: 'IFCLABEL', value: 'EI60' }, mm), 'EI60');
    assert.equal(toPropertyValue({ name: 'IFCLOGICAL', value: 'T' }, mm), true);
    assert.equal(toPropertyValue({ name: 'IFCLOGICAL', value: 'U' }, mm), null);
  });

  it('returns null for missing values', () => {
    assert.equal(toPropertyValue(null, mm), null);
  });

  it('treats blank labels as missing, since an empty IfcLabel carries no information', () => {
    assert.equal(toPropertyValue({ name: 'IFCLABEL', value: '' }, mm), null);
    assert.equal(toPropertyValue({ name: 'IFCLABEL', value: '   ' }, mm), null);
  });
});

describe('toIfcFrame', () => {
  it('maps the web-ifc Y-up frame back to IFC Z-up', () => {
    assert.deepEqual(toIfcFrame(1, 2, -3), [1, 3, 2]);
  });
});
