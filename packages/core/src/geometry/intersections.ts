import type { Aabb } from '../model.ts';
import { axisOverlaps, interpenetrates, intersectionBox, volume } from './aabb.ts';

export interface BoxedItem {
  readonly id: string;
  readonly aabb: Aabb;
}

export interface Intersection {
  /** Lexicographically smaller id; the relation itself is symmetric. */
  readonly a: string;
  readonly b: string;
  readonly box: Aabb;
  /** Volume of the intersection box, m³. */
  readonly volume: number;
  /** Minimum per-axis overlap, i.e. the penetration depth, m. */
  readonly depth: number;
}

const compare = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);

export function toIntersection(first: BoxedItem, second: BoxedItem): Intersection {
  const [a, b] = first.id < second.id ? [first, second] : [second, first];
  const box = intersectionBox(a.aabb, b.aabb);
  if (!box) throw new Error(`Boxes of ${a.id} and ${b.id} do not intersect`);
  return { a: a.id, b: b.id, box, volume: volume(box), depth: Math.min(...axisOverlaps(a.aabb, b.aabb)) };
}

/**
 * Broad phase by sweep and prune on the X axis (Baraff, 1992) followed by the
 * exact AABB interpenetration test on all three axes.
 * Cost: O(n log n) for sorting plus O(n·k) where k is the size of the active set.
 */
export function findIntersections(items: readonly BoxedItem[], tolerance: number): Intersection[] {
  if (!(tolerance >= 0)) throw new Error(`Tolerance must be a non-negative number, got ${tolerance}`);
  const sorted = [...items].sort((p, q) => p.aabb.minX - q.aabb.minX);
  const active: BoxedItem[] = [];
  const result: Intersection[] = [];

  for (const item of sorted) {
    // Drop boxes that end before this one starts (plus tolerance): they cannot overlap anything later.
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.aabb.maxX - item.aabb.minX <= tolerance) active.splice(i, 1);
    }
    for (const other of active) {
      if (interpenetrates(item.aabb, other.aabb, tolerance)) result.push(toIntersection(item, other));
    }
    active.push(item);
  }
  return result.sort((p, q) => (p.a === q.a ? compare(p.b, q.b) : compare(p.a, q.a)));
}
