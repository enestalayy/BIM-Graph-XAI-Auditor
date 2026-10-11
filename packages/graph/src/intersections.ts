import type { BoxedItem, Intersection } from '@bim/core';
import { chunk } from './batch.ts';
import type { CypherRunner, GraphWriter } from './client.ts';

/** Physical elements that have body geometry, i.e. the clash candidates of the whole federation. */
export async function loadBoxedElements(runner: CypherRunner): Promise<BoxedItem[]> {
  const rows = await runner.run(
    `MATCH (e:Element {category: 'physical'}) WHERE e.minX IS NOT NULL
     RETURN e.globalId AS id, e.minX AS minX, e.minY AS minY, e.minZ AS minZ,
            e.maxX AS maxX, e.maxY AS maxY, e.maxZ AS maxZ`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    aabb: {
      minX: Number(row.minX), minY: Number(row.minY), minZ: Number(row.minZ),
      maxX: Number(row.maxX), maxY: Number(row.maxY), maxZ: Number(row.maxZ),
    },
  }));
}

/**
 * Atomically replaces every INTERSECTS_WITH relationship with the given set
 * (stored a -> b, read undirected); a concurrent audit sees either the old or the new set.
 */
export async function replaceIntersections(graph: GraphWriter, hits: readonly Intersection[], tolerance: number): Promise<void> {
  await graph.inTransaction((tx) => writeIntersections(tx, hits, tolerance));
}

async function writeIntersections(runner: CypherRunner, hits: readonly Intersection[], tolerance: number): Promise<void> {
  await runner.run('MATCH ()-[r:INTERSECTS_WITH]->() DELETE r');
  const rows = hits.map((hit) => ({ a: hit.a, b: hit.b, ...hit.box, volume: hit.volume, depth: hit.depth }));
  for (const batch of chunk(rows)) {
    await runner.run(
      `UNWIND $rows AS row
       MATCH (a:Element {globalId: row.a}), (b:Element {globalId: row.b})
       CREATE (a)-[:INTERSECTS_WITH {
         minX: row.minX, minY: row.minY, minZ: row.minZ, maxX: row.maxX, maxY: row.maxY, maxZ: row.maxZ,
         volume: row.volume, depth: row.depth, tolerance: $tolerance
       }]->(b)`,
      { rows: batch, tolerance },
    );
  }
}
