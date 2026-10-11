import { connectGraph, ensureSchema, readGraphConfig } from '@bim/graph';
import { readServerConfig } from './config.ts';
import { buildApp } from './http/app.ts';
import { createExplainerFactory } from './services/explainers.ts';
import { createFileRuleRepository } from './services/rule-repository.ts';
import { createUploadStore } from './services/upload-store.ts';

const config = readServerConfig();
const graph = await connectGraph(readGraphConfig());
await ensureSchema(graph);

const app = await buildApp(
  {
    graph,
    rules: createFileRuleRepository(config.rulesFile),
    uploads: createUploadStore(config.uploadsDir),
    explainerFor: createExplainerFactory(config),
    settings: { clashTolerance: config.clashTolerance, maxUploadBytes: config.maxUploadBytes, defaultExplainer: config.defaultExplainer },
  },
  { logger: true },
);

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await graph.close();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutdown(signal).catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
  });
}

await app.listen({ port: config.port, host: config.host });
