import { parseArgs } from 'node:util';
import { loadViolations } from '@bim/graph';
import { explainAndStore } from '../services/explain.ts';
import { createExplainerFactory, isExplainerKind } from '../services/explainers.ts';
import { UsageError, type Command } from './command.ts';

export const explain: Command = async ({ graph, config, args }) => {
  const { values } = parseArgs({ args, options: { method: { type: 'string' }, id: { type: 'string' } } });
  const method = values.method ?? config.defaultExplainer;
  if (!isExplainerKind(method)) throw new UsageError('--method must be "template" or "ollama"');
  const explainer = createExplainerFactory(config)(method);
  const ids = values.id ? [values.id] : (await loadViolations(graph)).map((v) => v.id);
  for (const id of ids) {
    const x = await explainAndStore(graph, id, explainer);
    const ratio = (v: number | null | undefined) => (v == null ? 'n/a' : v.toFixed(2));
    console.log(`\n[${id}] ${x.method}, ${x.latencyMs.toFixed(0)} ms, faithfulness ${ratio(x.grounding.faithfulness)}, ` +
      `completeness ${ratio(x.grounding.completeness)}, ` +
      `citations ${x.grounding.citationCoverage.toFixed(2)}${x.grounding.hallucinated ? ', HALLUCINATED' : ''}`);
    console.log(x.text);
  }
};
