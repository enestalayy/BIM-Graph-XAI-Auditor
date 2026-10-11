import type { FastifyInstance } from 'fastify';
import { compileRule, parseRule } from '@bim/core';
import type { AppDependencies } from '../dependencies.ts';

export function registerRuleRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get('/api/rules', async () => deps.rules.load());

  /** Replaces the whole rule set; 400 with the validation issues when invalid. */
  app.put('/api/rules', async (request) => deps.rules.save(request.body));

  /** Compiles a single rule without saving it, for the editor's Cypher preview. */
  app.post('/api/rules/compile', async (request) => {
    const rule = parseRule(request.body);
    return { rule, ...compileRule(rule) };
  });
}
