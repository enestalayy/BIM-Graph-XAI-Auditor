import { findIntersections } from '@bim/core';
import { ingestModel, loadBoxedElements, replaceIntersections, type GraphWriter } from '@bim/graph';
import { parseIfc } from '@bim/ifc';

export interface IngestOutcome {
  readonly fileName: string;
  readonly discipline: string;
  readonly schema: string;
  readonly elements: number;
  readonly relations: number;
  readonly warnings: readonly string[];
  /** Intersections in the whole federated graph after this ingest. */
  readonly intersections: number;
}

/** Recomputes INTERSECTS_WITH over every physical element in the graph. */
export async function refreshIntersections(graph: GraphWriter, tolerance: number): Promise<number> {
  const hits = findIntersections(await loadBoxedElements(graph), tolerance);
  await replaceIntersections(graph, hits, tolerance);
  return hits.length;
}

/** IFC bytes -> domain model -> federated graph -> refreshed intersections. */
export async function ingestIfc(
  graph: GraphWriter,
  data: Uint8Array,
  source: { fileName: string; discipline: string },
  tolerance: number,
): Promise<IngestOutcome> {
  const model = await parseIfc(data, source);
  const result = await ingestModel(graph, model);
  return {
    fileName: result.fileName,
    discipline: source.discipline,
    schema: model.source.schema,
    elements: result.elements,
    relations: result.relations,
    warnings: model.warnings,
    intersections: await refreshIntersections(graph, tolerance),
  };
}
