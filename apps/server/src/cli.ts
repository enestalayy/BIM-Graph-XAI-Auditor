/**
 * Command-line entry point for scripted runs (thesis experiments).
 *
 *   npm run cli -- ingest --discipline ARCH data/sample/Building-Architecture.ifc
 *   npm run cli -- audit
 *   npm run cli -- explain [--method template|ollama] [--id <violationId>]
 */
import { connectGraph, ensureSchema, readGraphConfig } from '@bim/graph';
import { audit } from './commands/audit.ts';
import { UsageError, type Command } from './commands/command.ts';
import { explain } from './commands/explain.ts';
import { ingest } from './commands/ingest.ts';
import { readServerConfig } from './config.ts';

const USAGE = `Usage:
  cli ingest --discipline <ARCH|MEP|...> <file.ifc> [...more.ifc]
  cli audit
  cli explain [--method template|ollama] [--id <violationId>]`;

const COMMANDS: Readonly<Record<string, Command>> = { ingest, audit, explain };

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
