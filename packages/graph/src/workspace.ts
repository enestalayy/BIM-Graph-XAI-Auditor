import type { CypherRunner, GraphWriter } from './client.ts';

/**
 * Removes all project data (models, elements, findings, explanations, audit
 * history) in one transaction, keeping the rule definitions. Used when another
 * dataset is loaded into the working graph.
 */
export async function clearProjectData(graph: GraphWriter): Promise<void> {
  await graph.inTransaction(async (tx) => {
    await tx.run('MATCH (n) WHERE n:Element OR n:Model OR n:Violation OR n:Explanation OR n:Audit DETACH DELETE n');
  });
}

/** Records which catalog dataset the working graph holds (null: ad-hoc uploads). */
export async function setActiveDataset(runner: CypherRunner, datasetId: string | null): Promise<void> {
  await runner.run('MERGE (w:Workspace {id: "current"}) SET w.datasetId = $datasetId, w.updatedAt = datetime()', { datasetId });
}

export async function getActiveDataset(runner: CypherRunner): Promise<string | null> {
  const [row] = await runner.run('MATCH (w:Workspace {id: "current"}) RETURN w.datasetId AS datasetId');
  return row?.datasetId == null ? null : String(row.datasetId);
}
