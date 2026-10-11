import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { goldStandardSchema } from '@bim/core';
import { connectGraph, readDisposableGraphConfig } from '@bim/graph';
import { evaluateAgainstGold, evaluateExplanations, runInjectionExperiment } from '../evaluation/experiments.ts';
import { ms, pct, writeReport } from '../evaluation/report.ts';
import { createExplainerFactory, isExplainerKind } from '../services/explainers.ts';
import { createFileRuleRepository } from '../services/rule-repository.ts';
import { UsageError, type Command, type CommandContext } from './command.ts';

const RESULTS_DIR = 'evaluation/results';

async function injection({ config, args }: CommandContext): Promise<void> {
  const { values } = parseArgs({ args, options: { seeds: { type: 'string', default: '1,2,3,4,5' }, cases: { type: 'string', default: '60' } } });
  const seeds = values.seeds.split(',').map(Number);
  const cases = Number(values.cases);
  if (seeds.some((s) => !Number.isInteger(s)) || !Number.isInteger(cases) || cases < 1) throw new UsageError('--seeds a,b,c and --cases N must be integers');
  if (!process.env.NEO4J_TEST_URI) throw new UsageError('The injection experiment wipes its database; set NEO4J_TEST_URI to the disposable test instance');
  const graph = await connectGraph(readDisposableGraphConfig());
  try {
    const report = await runInjectionExperiment(graph, await createFileRuleRepository(config.rulesFile).load(), seeds, cases, config.clashTolerance);
    const rows = report.runs.map((r) =>
      `| ${r.seed} | ${r.cases} | ${r.metrics.truePositives} | ${r.metrics.falsePositives} | ${r.metrics.falseNegatives} | ` +
      `${pct(r.metrics.precision)} | ${pct(r.metrics.recall)} | ${pct(r.metrics.f1)} | ${ms(r.intersectionMs)} | ${ms(r.auditMs)} |`);
    const t = report.total;
    const md = [
      `# Hata enjeksiyonu deneyi — ${report.ruleId}`,
      '',
      `Tolerans: ${report.tolerance} m, tohumlar: ${seeds.join(', ')}, tohum başına durum: ${cases}.`,
      '',
      '| Tohum | Durum | TP | FP | FN | Kesinlik | Duyarlılık | F1 | Kesişim | Denetim |',
      '|---|---|---|---|---|---|---|---|---|---|',
      ...rows,
      `| **Toplam** | ${cases * seeds.length} | ${t.truePositives} | ${t.falsePositives} | ${t.falseNegatives} | ${pct(t.precision)} | ${pct(t.recall)} | ${pct(t.f1)} | | |`,
      '',
    ].join('\n');
    const paths = await writeReport(RESULTS_DIR, 'injection', report, md);
    console.log(md);
    console.log(`Saved ${paths.json} and ${paths.md}`);
  } finally {
    await graph.close();
  }
}

async function gold({ graph, config, args }: CommandContext): Promise<void> {
  const { values } = parseArgs({ args, options: { file: { type: 'string' } } });
  if (!values.file) throw new UsageError('evaluate gold requires --file <gold-standard.json>');
  const goldStandard = goldStandardSchema.parse(JSON.parse(await readFile(values.file, 'utf8')));
  const report = await evaluateAgainstGold(graph, await createFileRuleRepository(config.rulesFile).load(), goldStandard);
  const md = [
    `# Altın standart karşılaştırması — ${report.dataset}`,
    '',
    '| Kural | TP | FP | FN | Kesinlik | Duyarlılık | F1 |',
    '|---|---|---|---|---|---|---|',
    ...Object.entries(report.byRule).map(([rule, m]) =>
      `| ${rule} | ${m.truePositives} | ${m.falsePositives} | ${m.falseNegatives} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.f1)} |`),
    `| **Toplam** | ${report.total.truePositives} | ${report.total.falsePositives} | ${report.total.falseNegatives} | ` +
      `${pct(report.total.precision)} | ${pct(report.total.recall)} | ${pct(report.total.f1)} |`,
    '',
    `Yanlış pozitifler: ${report.total.falsePositiveIds.join(', ') || 'yok'}`,
    '',
    `Yanlış negatifler: ${report.total.falseNegativeIds.join(', ') || 'yok'}`,
    '',
  ].join('\n');
  const paths = await writeReport(RESULTS_DIR, `gold-${report.dataset}`, report, md);
  console.log(md);
  console.log(`Saved ${paths.json} and ${paths.md}`);
}

async function explanations({ graph, config, args }: CommandContext): Promise<void> {
  const { values } = parseArgs({ args, options: { method: { type: 'string', default: config.defaultExplainer }, limit: { type: 'string' } } });
  if (!isExplainerKind(values.method)) throw new UsageError('--method must be "template" or "ollama"');
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const explainer = createExplainerFactory(config)(values.method);
  const { summary, explanations: items } = await evaluateExplanations(graph, explainer, limit);
  const md = [
    `# Açıklama değerlendirmesi — ${summary.method}`,
    '',
    '| Açıklama | Halüsinasyon oranı | Ort. sadakat | Ort. eksiksizlik | Boş açıklama | Ort. atıf kapsaması | Biçim uyumu | Gecikme (medyan / p95) |',
    '|---|---|---|---|---|---|---|---|',
    `| ${summary.count} | ${pct(summary.hallucinationRate)} | ${pct(summary.meanFaithfulness)} | ${pct(summary.meanCompleteness)} | ` +
      `${pct(summary.emptyRate)} | ${pct(summary.meanCitationCoverage)} | ${pct(summary.formatCompliance)} | ` +
      `${ms(summary.latencyMs.median)} / ${ms(summary.latencyMs.p95)} |`,
    '',
    ...items.filter((x) => x.grounding.hallucinated).map((x) =>
      `- ${x.violationId}: desteksiz ${x.grounding.unsupported.map((e) => `${e.value} (${e.kind})`).join(', ')}`),
    '',
  ].join('\n');
  const paths = await writeReport(RESULTS_DIR, `explanations-${summary.method.replace(/[^\w.-]+/g, '_')}`, { summary, explanations: items }, md);
  console.log(md);
  console.log(`Saved ${paths.json} and ${paths.md}`);
}

const SUBCOMMANDS: Readonly<Record<string, (context: CommandContext) => Promise<void>>> = { injection, gold, explanations };

export const evaluate: Command = async (context) => {
  const [sub, ...rest] = context.args;
  const run = sub ? SUBCOMMANDS[sub] : undefined;
  if (!run) throw new UsageError('evaluate needs one of: injection, gold, explanations');
  await run({ ...context, args: rest });
};
