import { parseRule, type ElementContext, type ViolationContext } from '@bim/core';
import type { CypherRunner } from './client.ts';
import { loadViolations } from './audit-store.ts';

/** Graph retrieval for one finding: its rule definition and the involved elements with their surroundings. */
export async function loadViolationContext(runner: CypherRunner, violationId: string): Promise<ViolationContext | null> {
  const [violation] = await loadViolations(runner, [violationId]);
  if (!violation) return null;

  const ruleRows = await runner.run('MATCH (r:Rule {id: $id}) RETURN r.definition AS definition', { id: violation.ruleId });
  if (ruleRows.length === 0) throw new Error(`Rule ${violation.ruleId} of violation ${violationId} is missing from the graph`);
  const rule = parseRule(JSON.parse(String(ruleRows[0]!.definition)));

  const ids = [violation.subject.globalId, violation.object?.globalId];
  if (violation.evidence.kind === 'intersection' && violation.evidence.mitigation?.nearest) {
    ids.push(violation.evidence.mitigation.nearest.globalId);
  }
  const rows = await runner.run(
    `UNWIND $ids AS id
     MATCH (e:Element {globalId: id})
     OPTIONAL MATCH (e)-[:CONTAINED_IN]->(container:Element)
     OPTIONAL MATCH (e)-[:FROM_MODEL]->(m:Model)
     RETURN e {.*} AS props, collect(DISTINCT container.name) AS containers, collect(DISTINCT m.discipline) AS disciplines`,
    { ids: ids.filter((id): id is string => typeof id === 'string') },
  );

  const elements: Record<string, ElementContext> = {};
  for (const row of rows) {
    const props = row.props as Record<string, unknown>;
    const globalId = String(props.globalId);
    elements[globalId] = {
      ref: { globalId, ifcClass: String(props.ifcClass), name: props.name == null ? null : String(props.name) },
      properties: props,
      containers: (row.containers as unknown[]).filter((c) => c != null).map(String),
      disciplines: (row.disciplines as unknown[]).map(String),
    };
  }
  return { violation, rule, elements };
}
