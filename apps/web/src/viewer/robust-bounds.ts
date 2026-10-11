export interface Box3Like {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

const quantile = (sorted: readonly number[], q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;

/**
 * Indices of the boxes whose centres lie inside the [5%, 95%] range on every axis.
 * Used for the initial camera framing so that far-away helper objects (e.g. a
 * geo-reference marker kilometres away) do not shrink the building to a dot.
 */
export function coreBoxIndices(boxes: readonly Box3Like[]): number[] {
  if (boxes.length < 5) return boxes.map((_, i) => i);
  const centres = boxes.map((b) => [0, 1, 2].map((k) => (b.min[k]! + b.max[k]!) / 2));
  const ranges = [0, 1, 2].map((k) => {
    const sorted = centres.map((c) => c[k]!).sort((a, b) => a - b);
    return [quantile(sorted, 0.05), quantile(sorted, 0.95)] as const;
  });
  const inside = centres.map((c, i) => (c.every((v, k) => v >= ranges[k]![0] && v <= ranges[k]![1]) ? i : -1)).filter((i) => i >= 0);
  return inside.length > 0 ? inside : boxes.map((_, i) => i);
}
