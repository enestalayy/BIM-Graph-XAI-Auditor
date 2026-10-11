import type { Aabb } from '../model.ts';

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Per-axis overlap lengths; negative when the intervals are disjoint on that axis. */
export function axisOverlaps(a: Aabb, b: Aabb): [number, number, number] {
  return [
    Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX),
    Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY),
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ),
  ];
}

/**
 * Boxes interpenetrate when they overlap by more than `tolerance` on every axis.
 * Touching faces (overlap 0) and sub-tolerance contacts are therefore not clashes.
 */
export function interpenetrates(a: Aabb, b: Aabb, tolerance: number): boolean {
  return axisOverlaps(a, b).every((overlap) => overlap > tolerance);
}

/** The common box of two overlapping boxes, or null when they are disjoint. */
export function intersectionBox(a: Aabb, b: Aabb): Aabb | null {
  const box: Aabb = {
    minX: Math.max(a.minX, b.minX), minY: Math.max(a.minY, b.minY), minZ: Math.max(a.minZ, b.minZ),
    maxX: Math.min(a.maxX, b.maxX), maxY: Math.min(a.maxY, b.maxY), maxZ: Math.min(a.maxZ, b.maxZ),
  };
  return box.minX <= box.maxX && box.minY <= box.maxY && box.minZ <= box.maxZ ? box : null;
}

export function volume(box: Aabb): number {
  return (box.maxX - box.minX) * (box.maxY - box.minY) * (box.maxZ - box.minZ);
}

export function center(box: Aabb): Point3 {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2, z: (box.minZ + box.maxZ) / 2 };
}

/** Euclidean distance from a point to the closest point of a box (0 when inside). */
export function distanceToBox(point: Point3, box: Aabb): number {
  const dx = Math.max(box.minX - point.x, 0, point.x - box.maxX);
  const dy = Math.max(box.minY - point.y, 0, point.y - box.maxY);
  const dz = Math.max(box.minZ - point.z, 0, point.z - box.maxZ);
  return Math.hypot(dx, dy, dz);
}
