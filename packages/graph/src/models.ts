import type { CypherRunner } from './client.ts';

export interface ModelSummary {
  readonly fileName: string;
  readonly schema: string;
  readonly discipline: string;
  readonly ingestedAt: string;
  readonly elementCount: number;
}

export async function listModels(runner: CypherRunner): Promise<ModelSummary[]> {
  const rows = await runner.run(
    `MATCH (m:Model)
     OPTIONAL MATCH (e:Element)-[:FROM_MODEL]->(m)
     RETURN m.fileName AS fileName, m.schema AS schema, m.discipline AS discipline,
            toString(m.ingestedAt) AS ingestedAt, count(e) AS elementCount
     ORDER BY fileName`,
  );
  return rows.map((row) => ({
    fileName: String(row.fileName),
    schema: String(row.schema),
    discipline: String(row.discipline),
    ingestedAt: String(row.ingestedAt),
    elementCount: Number(row.elementCount),
  }));
}
