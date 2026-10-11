import { getActiveDataset } from '@bim/graph';
import { activateDataset, datasetStatuses, loadCatalog } from '../services/datasets.ts';
import { createFileRuleRepository } from '../services/rule-repository.ts';
import { createUploadStore } from '../services/upload-store.ts';
import { UsageError, type Command } from './command.ts';

export const dataset: Command = async ({ graph, config, args }) => {
  const [sub, id] = args;
  const catalog = await loadCatalog(config.catalogFile);
  if (sub === 'list') {
    const active = await getActiveDataset(graph);
    for (const d of await datasetStatuses(catalog, config.dataRoot)) {
      console.log(`${d.id === active ? '*' : ' '} ${d.id.padEnd(22)} ${d.available ? 'ready  ' : 'missing'} ${d.title} — ${d.files.length} file(s), ${d.license}`);
    }
    return;
  }
  if (sub !== 'load' || !id) throw new UsageError('dataset list | dataset load <id>');
  const chosen = catalog.datasets.find((d) => d.id === id);
  if (!chosen) throw new UsageError(`Unknown dataset ${id}`);
  const result = await activateDataset({
    graph, uploads: createUploadStore(config.uploadsDir), dataset: chosen, root: config.dataRoot,
    tolerance: config.clashTolerance, rules: await createFileRuleRepository(config.rulesFile).load(),
  });
  for (const m of result.models) console.log(`${m.fileName} [${m.discipline}]: ${m.elements} elements`);
  console.log(`intersections: ${result.intersections}`);
  console.table(result.audit.outcomes.map((o) => ({ rule: o.ruleId, violations: o.violations, ms: Number(o.durationMs.toFixed(1)) })));
  console.log(`${chosen.title}: ${result.audit.violations.length} violations, loaded and audited in ${(result.durationMs / 1000).toFixed(1)} s`);
};
