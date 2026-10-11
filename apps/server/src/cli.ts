/**
 * Command-line entry point for scripted runs (thesis experiments).
 *
 *   npm run cli -- ingest --discipline ARCH data/sample/Building-Architecture.ifc
 *   npm run cli -- audit
 *   npm run cli -- explain [--method template|ollama] [--id <violationId>]
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { connectGraph, ensureSchema, loadViolations, readGraphConfig, type GraphClient } from '@bim/graph';
import { readServerConfig } from './config.ts';
import { auditGraph } from './services/audit.ts';
import { explainAndStore } from './services/explain.ts';
import { createExplainerFactory, isExplainerKind } from './services/explainers.ts';
import { ingestIfc } from './services/ingest.ts';
import { createFileRuleRepository } from './services/rule-repository.ts';
import { assertSafeIfcFileName } from './services/upload-store.ts';

const USAGE = `Usage:
  cli ingest --discipline <ARCH|MEP|...> <file.ifc> [...more.ifc]
  cli audit
  cli explain [--method template|ollama] [--id <violationId>]`;

const config = readServerConfig();

async function ingest(graph: GraphClient, args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { discipline: { type: 'string' } } });
  if (!values.discipline || positionals.length === 0) throw new Error(USAGE);
  for (const path of positionals) {
    const fileName = assertSafeIfcFileName(basename(path));
    const outcome = await ingestIfc(graph, new Uint8Array(await readFile(path)), { fileName, discipline: values.discipline.toUpperCase() }, config.clashTolerance);
    console.log(`${outcome.fileName} [${outcome.schema}, ${outcome.discipline}]: ${outcome.elements} elements, ` +
      `${outcome.relations} relations; federated intersections: ${outcome.intersections}`);
    for (const warning of outcome.warnings) console.warn(`  warning: ${warning}`);
  }
}

async function audit(graph: GraphClient): Promise<void> {
  const result = await auditGraph(graph, await createFileRuleRepository(config.rulesFile).load());
  console.table(result.outcomes.map((o) => ({ rule: o.ruleId, violations: o.violations, ms: Number(o.durationMs.toFixed(1)) })));
  console.log(`Audit ${result.id}: ${result.violations.length} violations in ${result.durationMs.toFixed(1)} ms`);
}

async function explain(graph: GraphClient, args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { method: { type: 'string' }, id: { type: 'string' } } });
  const method = values.method ?? config.defaultExplainer;
  if (!isExplainerKind(method)) throw new Error(USAGE);
  const explainer = createExplainerFactory(config)(method);
  const ids = values.id ? [values.id] : (await loadViolations(graph)).map((v) => v.id);
  for (const id of ids) {
    const x = await explainAndStore(graph, id, explainer);
    console.log(`\n[${id}] ${x.method}, ${x.latencyMs.toFixed(0)} ms, faithfulness ${x.grounding.faithfulness.toFixed(2)}, ` +
      `citations ${x.grounding.citationCoverage.toFixed(2)}${x.grounding.hallucinated ? ', HALLUCINATED' : ''}`);
    console.log(x.text);
  }
}

const [command, ...rest] = process.argv.slice(2);
const commands: Record<string, (graph: GraphClient, args: string[]) => Promise<void>> = { ingest, audit, explain };
const run = command ? commands[command] : undefined;
if (!run) {
  console.error(USAGE);
  process.exit(2);
}

const graph = await connectGraph(readGraphConfig());
try {
  await ensureSchema(graph);
  await run(graph, rest);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await graph.close();
}
