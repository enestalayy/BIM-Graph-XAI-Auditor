import type { FastifyInstance } from 'fastify';
import { loadExplanations, loadViolationContext, loadViolations } from '@bim/graph';
import { BadRequestError, NotFoundError } from '../../errors.ts';
import { explainAndStore } from '../../services/explain.ts';
import { isExplainerKind } from '../../services/explainers.ts';
import type { AppDependencies } from '../dependencies.ts';

export function registerViolationRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get('/api/violations', async () => loadViolations(deps.graph));

  app.get<{ Params: { id: string } }>('/api/violations/:id', async (request) => {
    const context = await loadViolationContext(deps.graph, request.params.id);
    if (!context) throw new NotFoundError(`Violation ${request.params.id} not found`);
    return { ...context, explanations: await loadExplanations(deps.graph, request.params.id) };
  });

  app.post<{ Params: { id: string }; Body: { method?: unknown } | undefined }>('/api/violations/:id/explanations', async (request, reply) => {
    const method = request.body?.method ?? deps.settings.defaultExplainer;
    if (!isExplainerKind(method)) throw new BadRequestError('"method" must be "template" or "ollama"');
    const explanation = await explainAndStore(deps.graph, request.params.id, deps.explainerFor(method));
    return reply.code(201).send(explanation);
  });
}
