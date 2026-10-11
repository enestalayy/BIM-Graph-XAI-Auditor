import { resolve } from 'node:path';

export type ExplainerKind = 'template' | 'ollama';

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  /** Rule set file read and written by the rule editor. */
  readonly rulesFile: string;
  /** Dataset catalog (data/catalog.json); file paths in it are relative to dataRoot. */
  readonly catalogFile: string;
  readonly dataRoot: string;
  /** Uploaded IFC files are kept here so the web viewer can load them again. */
  readonly uploadsDir: string;
  /** AABB interpenetration tolerance, metres. */
  readonly clashTolerance: number;
  readonly maxUploadBytes: number;
  readonly defaultExplainer: ExplainerKind;
  readonly ollama: { readonly host: string; readonly model: string; readonly timeoutMs: number };
}

function positiveNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number, got "${raw}"`);
  return value;
}

/** Paths are resolved against the working directory (the repository root for npm scripts). */
export function readServerConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): ServerConfig {
  const explainer = env.EXPLAINER || 'template';
  if (explainer !== 'template' && explainer !== 'ollama') throw new Error(`EXPLAINER must be "template" or "ollama", got "${explainer}"`);
  return {
    port: positiveNumber(env, 'PORT', 3000),
    host: env.HOST || '127.0.0.1',
    rulesFile: resolve(cwd, env.RULES_FILE || 'rules/default.json'),
    catalogFile: resolve(cwd, env.CATALOG_FILE || 'data/catalog.json'),
    dataRoot: cwd,
    uploadsDir: resolve(cwd, env.UPLOADS_DIR || 'data/uploads'),
    clashTolerance: positiveNumber(env, 'CLASH_TOLERANCE_M', 0.001),
    maxUploadBytes: positiveNumber(env, 'MAX_UPLOAD_MB', 200) * 1024 * 1024,
    defaultExplainer: explainer,
    ollama: {
      host: env.OLLAMA_HOST || 'http://localhost:11434',
      model: env.OLLAMA_MODEL || 'llama3.1:8b',
      timeoutMs: positiveNumber(env, 'OLLAMA_TIMEOUT_MS', 180_000),
    },
  };
}
