import { readGraphConfig, type GraphConfig } from './client.ts';

/**
 * Configuration of the disposable database used by integration tests and by
 * experiments that wipe the graph. Refuses to return a target that is the same
 * as the working database (NEO4J_URI), so a misconfigured .env cannot destroy it.
 */
export function readDisposableGraphConfig(env: NodeJS.ProcessEnv = process.env): GraphConfig {
  const config = readGraphConfig(env, 'NEO4J_TEST_URI');
  const normalise = (uri: string) => uri.trim().replace(/\/+$/, '').toLowerCase();
  if (env.NEO4J_URI && normalise(env.NEO4J_URI) === normalise(config.uri)) {
    throw new Error('NEO4J_TEST_URI points at the working database (NEO4J_URI); refusing to wipe it');
  }
  return config;
}
