import { connectGraph, readGraphConfig, type GraphClient } from '../../src/index.ts';

/** Integration tests run only against the disposable test instance (NEO4J_TEST_URI). */
export const SKIP_REASON = process.env.NEO4J_TEST_URI
  ? false
  : 'NEO4J_TEST_URI is not set (docker compose --profile test up -d neo4j-test)';

export async function connectTestGraph(): Promise<GraphClient> {
  const client = await connectGraph(readGraphConfig(process.env, 'NEO4J_TEST_URI'));
  await client.run('MATCH (n) DETACH DELETE n'); // the test database is disposable by contract
  return client;
}
