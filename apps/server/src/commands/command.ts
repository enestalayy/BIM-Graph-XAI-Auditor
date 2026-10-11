import type { GraphClient } from '@bim/graph';
import type { ServerConfig } from '../config.ts';

export interface CommandContext {
  readonly graph: GraphClient;
  readonly config: ServerConfig;
  readonly args: string[];
}

export type Command = (context: CommandContext) => Promise<void>;

export class UsageError extends Error {
  override name = 'UsageError';
}
