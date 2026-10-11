import { createLlmExplainer, createOllamaGenerator, templateExplainer, type Explainer } from '@bim/xai';
import type { ExplainerKind, ServerConfig } from '../config.ts';

export type ExplainerFactory = (kind: ExplainerKind) => Explainer;

export function createExplainerFactory(config: Pick<ServerConfig, 'ollama'>): ExplainerFactory {
  let ollama: Explainer | undefined;
  return (kind) => {
    if (kind === 'template') return templateExplainer;
    ollama ??= createLlmExplainer(createOllamaGenerator(config.ollama));
    return ollama;
  };
}

export function isExplainerKind(value: unknown): value is ExplainerKind {
  return value === 'template' || value === 'ollama';
}
