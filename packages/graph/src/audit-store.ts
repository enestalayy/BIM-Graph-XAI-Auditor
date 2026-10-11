import { compileRule, type Rule, type Violation } from '@bim/core';
import { chunk } from './batch.ts';
import type { CypherRunner } from './client.ts';
import type { AuditResult } from './audit.ts';

/**
 * Persists an audit: the rule set as :Rule nodes (with their compiled Cypher for
 * traceability), the audit summary as an :Audit node and the current findings as
 * :Violation nodes linked to their rule and elements. Violations of earlier
 * audits are replaced; audit summaries are kept as history.
 */
export async function saveAudit(runner: CypherRunner, rules: readonly Rule[], audit: AuditResult): Promise<void> {
  const ruleRows = rules.map((rule) => ({
    id: rule.id,
    props: {
      title: rule.title,
      kind: rule.kind,
      severity: rule.severity,
      enabled: rule.enabled,
      regulationSource: rule.regulation.source,
      regulationArticle: rule.regulation.article,
      regulationVerified: rule.regulation.verified,
      definition: JSON.stringify(rule),
      cypher: compileRule(rule).cypher,
    },
  }));
  await runner.run('MATCH (r:Rule) WHERE NOT r.id IN $ids DETACH DELETE r', { ids: rules.map((r) => r.id) });
  await runner.run('UNWIND $rows AS row MERGE (r:Rule {id: row.id}) SET r += row.props', { rows: ruleRows });

  await runner.run('MATCH (v:Violation) DETACH DELETE v');
  await runner.run(
    `CREATE (:Audit {id: $id, startedAt: datetime($startedAt), durationMs: $durationMs,
                     ruleCount: $ruleCount, violationCount: $violationCount, outcomes: $outcomes})`,
    {
      id: audit.id,
      startedAt: audit.startedAt,
      durationMs: audit.durationMs,
      ruleCount: audit.outcomes.length,
      violationCount: audit.violations.length,
      outcomes: JSON.stringify(audit.outcomes),
    },
  );

  const rows = audit.violations.map((v) => ({
    id: v.id,
    ruleId: v.ruleId,
    severity: v.severity,
    subject: v.subject.globalId,
    object: v.object?.globalId ?? null,
    evidence: JSON.stringify(v.evidence),
  }));
  for (const batch of chunk(rows)) {
    await runner.run(
      `MATCH (a:Audit {id: $auditId})
       UNWIND $rows AS row
       MATCH (r:Rule {id: row.ruleId}), (s:Element {globalId: row.subject})
       CREATE (v:Violation {id: row.id, ruleId: row.ruleId, severity: row.severity, evidence: row.evidence})
       CREATE (v)-[:OF_RULE]->(r), (v)-[:FOUND_IN]->(a), (v)-[:INVOLVES {role: 'subject'}]->(s)
       WITH v, row
       OPTIONAL MATCH (o:Element {globalId: row.object})
       FOREACH (_ IN CASE WHEN o IS NULL THEN [] ELSE [1] END | CREATE (v)-[:INVOLVES {role: 'object'}]->(o))`,
      { auditId: audit.id, rows: batch },
    );
  }
}

/** Reads the current findings back as domain objects, optionally only the given ids. */
export async function loadViolations(runner: CypherRunner, ids?: readonly string[]): Promise<Violation[]> {
  const rows = await runner.run(
    `MATCH (v:Violation)-[:INVOLVES {role: 'subject'}]->(s:Element)
     WHERE $ids IS NULL OR v.id IN $ids
     OPTIONAL MATCH (v)-[:INVOLVES {role: 'object'}]->(o:Element)
     RETURN v.id AS id, v.ruleId AS ruleId, v.severity AS severity, v.evidence AS evidence,
            s {.globalId, .ifcClass, .name} AS subject,
            CASE WHEN o IS NULL THEN null ELSE o {.globalId, .ifcClass, .name} END AS object
     ORDER BY id`,
    { ids: ids ?? null },
  );
  return rows.map((row) => ({
    id: String(row.id),
    ruleId: String(row.ruleId),
    severity: row.severity as Violation['severity'],
    subject: row.subject as Violation['subject'],
    object: (row.object ?? null) as Violation['object'],
    evidence: JSON.parse(String(row.evidence)) as Violation['evidence'],
  }));
}
