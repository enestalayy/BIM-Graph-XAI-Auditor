import type { FastifyInstance } from 'fastify';
import { loadLatestAudit } from '@bim/graph';
import { auditGraph } from '../../services/audit.ts';
import type { AppDependencies } from '../dependencies.ts';

export function registerAuditRoutes(app: FastifyInstance, deps: AppDependencies): void {
  /** Per-rule counts and coverage of the most recent audit; null before the first audit. */
  app.get('/api/audits/latest', async () => loadLatestAudit(deps.graph));

  app.post('/api/audits', async (_request, reply) => {
    const audit = await auditGraph(deps.graph, await deps.rules.load());
    return reply.code(201).send(audit);
  });
}
