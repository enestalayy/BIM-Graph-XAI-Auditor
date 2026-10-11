import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findIntersections, interpenetrates, type BoxedItem } from '../src/index.ts';

const item = (id: string, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): BoxedItem =>
  ({ id, aabb: { minX, minY, minZ, maxX, maxY, maxZ } });

/** Deterministic PRNG (mulberry32) so the randomized test is reproducible. */
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('findIntersections', () => {
  it('reports each intersecting pair once with ordered ids, box, volume and depth', () => {
    const result = findIntersections([item('wall', 0, 0, 0, 4, 0.2, 3), item('duct', 1, -1, 1, 1.5, 1, 1.5)], 0.001);
    assert.equal(result.length, 1);
    const [hit] = result;
    assert.equal(hit!.a, 'duct');
    assert.equal(hit!.b, 'wall');
    assert.deepEqual(hit!.box, { minX: 1, minY: 0, minZ: 1, maxX: 1.5, maxY: 0.2, maxZ: 1.5 });
    assert.ok(Math.abs(hit!.volume - 0.5 * 0.2 * 0.5) < 1e-12);
    assert.ok(Math.abs(hit!.depth - 0.2) < 1e-12);
  });

  it('does not report touching or separated boxes', () => {
    const result = findIntersections([item('a', 0, 0, 0, 1, 1, 1), item('b', 1, 0, 0, 2, 1, 1), item('c', 5, 5, 5, 6, 6, 6)], 0);
    assert.deepEqual(result, []);
  });

  it('matches the brute-force O(n²) result on random boxes', () => {
    const random = prng(42);
    const items: BoxedItem[] = Array.from({ length: 300 }, (_, i) => {
      const [x, y, z] = [random() * 50, random() * 50, random() * 10];
      return item(`e${i}`, x, y, z, x + random() * 4, y + random() * 4, z + random() * 2);
    });
    const tolerance = 0.001;
    const expected: string[] = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const [p, q] = [items[i]!, items[j]!];
        if (interpenetrates(p.aabb, q.aabb, tolerance)) expected.push([p.id, q.id].sort().join('|'));
      }
    }
    const actual = findIntersections(items, tolerance).map((hit) => `${hit.a}|${hit.b}`);
    assert.ok(expected.length > 0, 'test data should contain intersections');
    assert.deepEqual(actual.sort(), expected.sort());
  });

  it('rejects a negative tolerance', () => {
    assert.throws(() => findIntersections([], -1), /non-negative/);
  });
});
