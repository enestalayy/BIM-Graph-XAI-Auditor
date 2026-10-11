import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datasetCatalogSchema, type Dataset, type DatasetCatalog, type RuleSet } from '@bim/core';
import { clearProjectData, setActiveDataset, type AuditResult, type GraphWriter } from '@bim/graph';
import { auditGraph } from './audit.ts';
import { ingestIfc, refreshIntersections } from './ingest.ts';
import type { UploadStore } from './upload-store.ts';

export class DatasetUnavailableError extends Error {
  override name = 'DatasetUnavailableError';
}

export async function loadCatalog(path: string): Promise<DatasetCatalog> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read dataset catalog ${path}: ${(error as Error).message}`, { cause: error });
  }
  return datasetCatalogSchema.parse(JSON.parse(raw));
}

export interface DatasetStatus extends Dataset {
  /** All files are present locally. */
  readonly available: boolean;
  readonly missingFiles: readonly string[];
}

export async function datasetStatuses(catalog: DatasetCatalog, root: string): Promise<DatasetStatus[]> {
  return Promise.all(catalog.datasets.map(async (dataset) => {
    const missingFiles: string[] = [];
    for (const file of dataset.files) {
      await access(resolve(root, file.path)).catch(() => missingFiles.push(file.name));
    }
    return { ...dataset, available: missingFiles.length === 0, missingFiles };
  }));
}

export interface ActivationResult {
  readonly datasetId: string;
  readonly models: readonly { fileName: string; discipline: string; elements: number; warnings: readonly string[] }[];
  readonly intersections: number;
  readonly audit: AuditResult;
  readonly durationMs: number;
}

/**
 * Replaces the working graph with a catalog dataset: clears project data, ingests
 * every file (keeping a copy for the viewer), computes intersections once and runs
 * the current rule set.
 */
export async function activateDataset(deps: {
  graph: GraphWriter;
  uploads: UploadStore;
  dataset: Dataset;
  root: string;
  tolerance: number;
  rules: RuleSet;
}): Promise<ActivationResult> {
  const { graph, uploads, dataset, root, tolerance, rules } = deps;
  const started = performance.now();
  const files = await Promise.all(dataset.files.map(async (file) => {
    try {
      return { file, data: new Uint8Array(await readFile(resolve(root, file.path))) };
    } catch {
      throw new DatasetUnavailableError(`${file.name} is missing; run "npm run datasets:fetch -- ${dataset.id}"`);
    }
  }));

  await clearProjectData(graph);
  await setActiveDataset(graph, null); // until the load completes
  const models: ActivationResult['models'][number][] = [];
  for (const { file, data } of files) {
    const outcome = await ingestIfc(graph, data, { fileName: file.name, discipline: file.discipline }, tolerance, { refresh: false });
    await uploads.save(file.name, data);
    models.push({ fileName: file.name, discipline: file.discipline, elements: outcome.elements, warnings: outcome.warnings });
  }
  const intersections = await refreshIntersections(graph, tolerance);
  await setActiveDataset(graph, dataset.id);
  const audit = await auditGraph(graph, rules);
  return { datasetId: dataset.id, models, intersections, audit, durationMs: performance.now() - started };
}
