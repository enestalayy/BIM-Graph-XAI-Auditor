import type { CypherRunner } from './client.ts';

const STATEMENTS = [
  'CREATE CONSTRAINT element_global_id IF NOT EXISTS FOR (e:Element) REQUIRE e.globalId IS UNIQUE',
  'CREATE CONSTRAINT model_file_name IF NOT EXISTS FOR (m:Model) REQUIRE m.fileName IS UNIQUE',
  'CREATE CONSTRAINT rule_id IF NOT EXISTS FOR (r:Rule) REQUIRE r.id IS UNIQUE',
  'CREATE CONSTRAINT violation_id IF NOT EXISTS FOR (v:Violation) REQUIRE v.id IS UNIQUE',
  'CREATE INDEX element_ifc_class IF NOT EXISTS FOR (e:Element) ON (e.ifcClass)',
  'CREATE INDEX element_category IF NOT EXISTS FOR (e:Element) ON (e.category)',
] as const;

/** Creates constraints and indexes; idempotent. */
export async function ensureSchema(runner: CypherRunner): Promise<void> {
  for (const statement of STATEMENTS) await runner.run(statement);
}
