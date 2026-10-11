import type { FastifyInstance } from 'fastify';
import { auditGraph } from '../../services/audit.ts';
import type { AppDependencies } from '../dependencies.ts';

export function registerAuditRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.post('/api/audits', async (_request, reply) => {
    const audit = await auditGraph(deps.graph, await deps.rules.load());
    return reply.code(201).send(audit);
  });
}
