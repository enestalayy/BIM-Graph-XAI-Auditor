/**
 * Command-line entry point for scripted runs (thesis experiments).
 *
 *   npm run cli -- ingest --discipline ARCH data/sample/Building-Architecture.ifc
 *   npm run cli -- audit
 *   npm run cli -- explain [--method template|ollama] [--id <violationId>]
 *   npm run cli -- evaluate injection|gold|explanations [...]
 */
import { connectGraph, ensureSchema, readGraphConfig } from '@bim/graph';
import { audit } from './commands/audit.ts';
import { dataset } from './commands/dataset.ts';
import { evaluate } from './commands/evaluate.ts';
import { UsageError, type Command } from './commands/command.ts';
import { explain } from './commands/explain.ts';
import { ingest } from './commands/ingest.ts';
import { readServerConfig } from './config.ts';

const USAGE = `Usage:
  cli dataset list | dataset load <id>
  cli ingest --discipline <ARCH|MEP|...> <file.ifc> [...more.ifc]
  cli audit
  cli explain [--method template|ollama] [--id <violationId>]
  cli evaluate injection [--seeds 1,2,3,4,5] [--cases 60]   (uses NEO4J_TEST_URI, wipes it)
  cli evaluate gold --file <gold-standard.json>
  cli evaluate explanations [--method template|ollama] [--limit N]`;

const COMMANDS: Readonly<Record<string, Command>> = { dataset, ingest, audit, explain, evaluate };

const [name, ...args] = process.argv.slice(2);
const command = name ? COMMANDS[name] : undefined;
if (!command) {
  console.error(USAGE);
  process.exit(2);
}

const config = readServerConfig();
const graph = await connectGraph(readGraphConfig());
try {
  await ensureSchema(graph);
  await command({ graph, config, args });
} catch (error) {
  console.error(error instanceof UsageError ? `${error.message}\n\n${USAGE}` : (error as Error).message);
  process.exitCode = 1;
} finally {
  await graph.close();
}
