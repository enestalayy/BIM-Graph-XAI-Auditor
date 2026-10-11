import type { FastifyInstance } from 'fastify';
import { getActiveDataset } from '@bim/graph';
import { NotFoundError } from '../../errors.ts';
import { activateDataset, datasetStatuses } from '../../services/datasets.ts';
import type { AppDependencies } from '../dependencies.ts';

export function registerDatasetRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get('/api/datasets', async () => ({
    active: await getActiveDataset(deps.graph),
    datasets: await datasetStatuses(deps.catalog, deps.settings.dataRoot),
  }));

  /** Replaces the working graph with the dataset and audits it. */
  app.post<{ Params: { id: string } }>('/api/datasets/:id/activate', async (request, reply) => {
    const dataset = deps.catalog.datasets.find((d) => d.id === request.params.id);
    if (!dataset) throw new NotFoundError(`Unknown dataset ${request.params.id}`);
    const result = await activateDataset({
      graph: deps.graph,
      uploads: deps.uploads,
      dataset,
      root: deps.settings.dataRoot,
      tolerance: deps.settings.clashTolerance,
      rules: await deps.rules.load(),
    });
    return reply.code(201).send(result);
  });
}
