import type { ElementContext } from '@bim/core';
import type { CypherRunner } from './client.ts';

/** One element with all its stored properties, containing spaces/storeys and source models. */
export async function loadElement(runner: CypherRunner, globalId: string): Promise<ElementContext | null> {
  const [row] = await runner.run(
    `MATCH (e:Element {globalId: $globalId})
     OPTIONAL MATCH (e)-[:CONTAINED_IN]->(container:Element)
     OPTIONAL MATCH (e)-[:FROM_MODEL]->(m:Model)
     RETURN e {.*} AS props, collect(DISTINCT container.name) AS containers, collect(DISTINCT m.discipline) AS disciplines`,
    { globalId },
  );
  if (!row) return null;
  const props = row.props as Record<string, unknown>;
  return {
    ref: { globalId, ifcClass: String(props.ifcClass), name: props.name == null ? null : String(props.name) },
    properties: props,
    containers: (row.containers as unknown[]).filter((c) => c != null).map(String),
    disciplines: (row.disciplines as unknown[]).map(String),
  };
}
