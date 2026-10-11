import neo4j, { type Driver } from 'neo4j-driver';

export type Params = Record<string, unknown>;
export type Row = Record<string, unknown>;

/** The only capability repository functions need; lets them be tested against any runner. */
export interface CypherRunner {
  run(cypher: string, params?: Params): Promise<Row[]>;
}

/** A runner that can group several statements into one atomic write transaction. */
export interface GraphWriter extends CypherRunner {
  /**
   * Runs `work` in a single managed write transaction: either every statement
   * commits or none does, and readers never see the intermediate state. The
   * driver may retry `work` on transient errors, so it must be idempotent.
   */
  inTransaction<T>(work: (tx: CypherRunner) => Promise<T>): Promise<T>;
}

export interface GraphClient extends GraphWriter {
  close(): Promise<void>;
}

export interface GraphConfig {
  readonly uri: string;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

/** Reads connection settings from the environment; fails loudly when something is missing. */
export function readGraphConfig(env: NodeJS.ProcessEnv = process.env, uriVariable = 'NEO4J_URI'): GraphConfig {
  const missing = [uriVariable, 'NEO4J_USER', 'NEO4J_PASSWORD'].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Missing environment variables: ${missing.join(', ')} (see .env.example)`);
  return {
    uri: env[uriVariable]!,
    user: env.NEO4J_USER!,
    password: env.NEO4J_PASSWORD!,
    database: env.NEO4J_DATABASE || 'neo4j',
  };
}

export async function connectGraph(config: GraphConfig): Promise<GraphClient> {
  const driver: Driver = neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
    disableLosslessIntegers: true, // counts and ids stay far below 2^53
    connectionTimeout: 10_000,
    connectionAcquisitionTimeout: 30_000,
    maxTransactionRetryTime: 15_000,
  });
  try {
    await driver.verifyConnectivity({ database: config.database });
  } catch (error) {
    await driver.close();
    throw new Error(`Cannot connect to Neo4j at ${config.uri}: ${(error as Error).message}`, { cause: error });
  }
  return {
    // executeQuery runs a managed transaction and retries transient failures.
    run: async (cypher, params = {}) => {
      const result = await driver.executeQuery(cypher, params, { database: config.database });
      return result.records.map((record) => record.toObject());
    },
    inTransaction: async (work) => {
      const session = driver.session({ database: config.database });
      try {
        return await session.executeWrite((tx) =>
          work({ run: async (cypher, params = {}) => (await tx.run(cypher, params)).records.map((record) => record.toObject()) }));
      } finally {
        await session.close();
      }
    },
    close: () => driver.close(),
  };
}
