import { compileRule, type Rule, type Violation } from '@bim/core';
import { chunk } from './batch.ts';
import type { CypherRunner, GraphWriter } from './client.ts';
import type { AuditResult } from './audit.ts';

/**
 * Persists an audit atomically: the rule set as :Rule nodes (with their compiled
 * Cypher for traceability), the audit summary as an :Audit node and the current
 * findings as :Violation nodes linked to their rule and elements.
 *
 * Violations are matched by their deterministic id: a finding that persists keeps
 * its node and therefore its explanations; findings that no longer occur are
 * removed together with their explanations. Audit summaries are kept as history.
 */
export async function saveAudit(graph: GraphWriter, rules: readonly Rule[], audit: AuditResult): Promise<void> {
  await graph.inTransaction((tx) => writeAudit(tx, rules, audit));
}

async function writeAudit(runner: CypherRunner, rules: readonly Rule[], audit: AuditResult): Promise<void> {
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

  const currentIds = audit.violations.map((v) => v.id);
  await runner.run(
    `MATCH (v:Violation) WHERE NOT v.id IN $ids
     OPTIONAL MATCH (x:Explanation)-[:EXPLAINS]->(v)
     DETACH DELETE x, v`,
    { ids: currentIds },
  );
  // Links of surviving violations are rebuilt below from the current evidence.
  await runner.run('MATCH (v:Violation)-[r:OF_RULE|INVOLVES|FOUND_IN]->() DELETE r');
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
       MERGE (v:Violation {id: row.id})
       SET v.ruleId = row.ruleId, v.severity = row.severity, v.evidence = row.evidence
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

export interface StoredAudit {
  readonly id: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly outcomes: AuditResult['outcomes'];
}

/** The most recent audit summary (per-rule counts and coverage), or null if none ran yet. */
export async function loadLatestAudit(runner: CypherRunner): Promise<StoredAudit | null> {
  const [row] = await runner.run(
    `MATCH (a:Audit) RETURN a.id AS id, toString(a.startedAt) AS startedAt, a.durationMs AS durationMs, a.outcomes AS outcomes
     ORDER BY a.startedAt DESC LIMIT 1`,
  );
  if (!row) return null;
  return { id: String(row.id), startedAt: String(row.startedAt), durationMs: Number(row.durationMs), outcomes: JSON.parse(String(row.outcomes)) };
}
