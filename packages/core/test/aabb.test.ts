import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { center, distanceToBox, interpenetrates, intersectionBox, volume, type Aabb } from '../src/index.ts';

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb =>
  ({ minX, minY, minZ, maxX, maxY, maxZ });

describe('interpenetrates', () => {
  const unit = box(0, 0, 0, 1, 1, 1);

  it('is true when boxes overlap on every axis beyond the tolerance', () => {
    assert.equal(interpenetrates(unit, box(0.5, 0.5, 0.5, 2, 2, 2), 0.001), true);
  });

  it('is false for boxes that only touch at a face', () => {
    assert.equal(interpenetrates(unit, box(1, 0, 0, 2, 1, 1), 0), false);
  });

  it('is false when the overlap on one axis is within the tolerance', () => {
    assert.equal(interpenetrates(unit, box(0.9995, 0, 0, 2, 1, 1), 0.001), false);
  });

  it('is false for disjoint boxes', () => {
    assert.equal(interpenetrates(unit, box(0, 0, 3, 1, 1, 4), 0), false);
  });
});

describe('intersection box metrics', () => {
  it('computes the common box, its volume and centre', () => {
    const common = intersectionBox(box(0, 0, 0, 2, 2, 2), box(1, 1, 1, 3, 3, 3));
    assert.deepEqual(common, box(1, 1, 1, 2, 2, 2));
    assert.equal(volume(common!), 1);
    assert.deepEqual(center(common!), { x: 1.5, y: 1.5, z: 1.5 });
  });

  it('returns null for disjoint boxes', () => {
    assert.equal(intersectionBox(box(0, 0, 0, 1, 1, 1), box(2, 2, 2, 3, 3, 3)), null);
  });
});

describe('distanceToBox', () => {
  const unit = box(0, 0, 0, 1, 1, 1);

  it('is zero inside the box', () => {
    assert.equal(distanceToBox({ x: 0.5, y: 0.5, z: 0.5 }, unit), 0);
  });

  it('is the Euclidean distance to the nearest point outside', () => {
    assert.equal(distanceToBox({ x: 4, y: 5, z: 0.5 }, unit), 5);
  });
});
