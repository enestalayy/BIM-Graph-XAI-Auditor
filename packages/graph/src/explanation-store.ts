import type { Explanation } from '@bim/core';
import type { CypherRunner } from './client.ts';

export async function saveExplanation(runner: CypherRunner, explanation: Explanation): Promise<void> {
  const rows = await runner.run(
    `MATCH (v:Violation {id: $violationId})
     CREATE (x:Explanation {
       id: $id, violationId: $violationId, method: $method, text: $text, latencyMs: $latencyMs,
       createdAt: datetime($createdAt), faithfulness: $faithfulness, citationCoverage: $citationCoverage,
       hallucinated: $hallucinated, facts: $facts, grounding: $grounding
     })-[:EXPLAINS]->(v)
     RETURN x.id AS id`,
    {
      id: explanation.id,
      violationId: explanation.violationId,
      method: explanation.method,
      text: explanation.text,
      latencyMs: explanation.latencyMs,
      createdAt: explanation.createdAt,
      faithfulness: explanation.grounding.faithfulness,
      citationCoverage: explanation.grounding.citationCoverage,
      hallucinated: explanation.grounding.hallucinated,
      facts: JSON.stringify(explanation.facts),
      grounding: JSON.stringify(explanation.grounding),
    },
  );
  if (rows.length === 0) throw new Error(`Violation ${explanation.violationId} not found; explanation not saved`);
}

export async function loadExplanations(runner: CypherRunner, violationId: string): Promise<Explanation[]> {
  const rows = await runner.run(
    `MATCH (x:Explanation)-[:EXPLAINS]->(:Violation {id: $violationId})
     RETURN x {.*, createdAt: toString(x.createdAt)} AS x ORDER BY x.createdAt DESC`,
    { violationId },
  );
  return rows.map(({ x }) => {
    const r = x as Record<string, unknown>;
    return {
      id: String(r.id),
      violationId: String(r.violationId),
      method: String(r.method),
      text: String(r.text),
      latencyMs: Number(r.latencyMs),
      createdAt: String(r.createdAt),
      facts: JSON.parse(String(r.facts)),
      grounding: JSON.parse(String(r.grounding)),
    };
  });
}
