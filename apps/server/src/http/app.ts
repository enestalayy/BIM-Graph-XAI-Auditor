import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { RuleValidationError } from '@bim/core';
import { InvalidIfcError } from '@bim/ifc';
import { BadRequestError, NotFoundError } from '../errors.ts';
import type { AppDependencies } from './dependencies.ts';
import { registerAuditRoutes } from './routes/audits.ts';
import { registerModelRoutes } from './routes/models.ts';
import { registerRuleRoutes } from './routes/rules.ts';
import { registerViolationRoutes } from './routes/violations.ts';

export async function buildApp(deps: AppDependencies, options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 5 * 1024 * 1024 });
  await app.register(multipart, { limits: { fileSize: deps.settings.maxUploadBytes, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof RuleValidationError) return reply.code(400).send({ error: 'invalid_rule', message: error.message, issues: error.issues });
    if (error instanceof BadRequestError || error instanceof InvalidIfcError) return reply.code(400).send({ error: 'bad_request', message: error.message });
    if (error instanceof NotFoundError) return reply.code(404).send({ error: 'not_found', message: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: 'bad_request', message: (error as Error).message });
    request.log.error(error);
    return reply.code(500).send({ error: 'internal', message: (error as Error).message });
  });

  app.get('/api/health', async () => {
    await deps.graph.run('RETURN 1');
    return { status: 'ok' };
  });
  registerModelRoutes(app, deps);
  registerRuleRoutes(app, deps);
  registerAuditRoutes(app, deps);
  registerViolationRoutes(app, deps);
  return app;
}
