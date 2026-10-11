import { assertIfcClassName, quoteIdentifier, type Element, type IfcModel, type RelationType } from '@bim/core';
import { chunk } from './batch.ts';
import type { CypherRunner, GraphWriter } from './client.ts';
import { elementLabels, toNodeProperties } from './node-properties.ts';

export interface IngestResult {
  readonly fileName: string;
  readonly elements: number;
  readonly relations: number;
}

const RELATION_TYPES: readonly RelationType[] = ['CONTAINED_IN', 'AGGREGATES', 'HOSTED_BY'];

/**
 * Removes what a previous ingest of the same file contributed. Elements shared
 * with another model (same GlobalId, e.g. the storey) are kept.
 */
async function removePreviousContribution(runner: CypherRunner, fileName: string): Promise<void> {
  await runner.run(
    `MATCH (e:Element)-[:FROM_MODEL]->(m:Model {fileName: $fileName})
     WHERE NOT EXISTS { (e)-[:FROM_MODEL]->(other:Model) WHERE other <> m }
     DETACH DELETE e`,
    { fileName },
  );
  await runner.run('MATCH (:Element)-[f:FROM_MODEL]->(:Model {fileName: $fileName}) DELETE f', { fileName });
}

function groupByLabels(elements: readonly Element[]): Map<string, Element[]> {
  const groups = new Map<string, Element[]>();
  for (const element of elements) {
    const [, ...ifcLabels] = elementLabels(element);
    const key = ifcLabels.map(assertIfcClassName).map(quoteIdentifier).join(':');
    groups.set(key, [...(groups.get(key) ?? []), element]);
  }
  return groups;
}

/**
 * Writes one parsed IFC model into the federated graph in a single transaction;
 * re-ingesting a file replaces it, and a failure leaves the previous state intact.
 */
export async function ingestModel(graph: GraphWriter, model: IfcModel): Promise<IngestResult> {
  return graph.inTransaction((tx) => writeModel(tx, model));
}

async function writeModel(runner: CypherRunner, model: IfcModel): Promise<IngestResult> {
  const { fileName, schema, discipline } = model.source;
  await removePreviousContribution(runner, fileName);
  await runner.run(
    `MERGE (m:Model {fileName: $fileName})
     SET m.schema = $schema, m.discipline = $discipline, m.ingestedAt = datetime()`,
    { fileName, schema, discipline },
  );

  for (const [labels, elements] of groupByLabels(model.elements)) {
    for (const rows of chunk(elements.map((e) => ({ globalId: e.globalId, props: toNodeProperties(e) })))) {
      await runner.run(
        `MATCH (m:Model {fileName: $fileName})
         UNWIND $rows AS row
         MERGE (e:Element {globalId: row.globalId})
         SET e += row.props, e:${labels}
         MERGE (e)-[:FROM_MODEL]->(m)`,
        { fileName, rows },
      );
    }
  }

  for (const type of RELATION_TYPES) {
    const rows = model.relations.filter((r) => r.type === type).map(({ from, to }) => ({ from, to }));
    for (const batch of chunk(rows)) {
      await runner.run(
        `UNWIND $rows AS row
         MATCH (a:Element {globalId: row.from}), (b:Element {globalId: row.to})
         MERGE (a)-[:${type}]->(b)`,
        { rows: batch },
      );
    }
  }
  return { fileName, elements: model.elements.length, relations: model.relations.length };
}
