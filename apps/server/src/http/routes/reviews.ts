import type { FastifyInstance } from 'fastify';
import type { AppDependencies } from '../dependencies.ts';

export function registerReviewRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get<{ Params: { dataset: string } }>('/api/reviews/:dataset', async (request) => deps.reviews.load(request.params.dataset));

  app.put<{ Params: { dataset: string; index: string }; Body: { verdict?: unknown; comment?: unknown } }>(
    '/api/reviews/:dataset/:index',
    async (request) => deps.reviews.record(request.params.dataset, Number(request.params.index), {
      verdict: request.body?.verdict as never,
      comment: typeof request.body?.comment === 'string' ? request.body.comment : '',
    }),
  );
}
