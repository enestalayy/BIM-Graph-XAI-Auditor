import type { GraphWriter } from '@bim/graph';
import type { ExplainerKind } from '../config.ts';
import type { ExplainerFactory } from '../services/explainers.ts';
import type { RuleRepository } from '../services/rule-repository.ts';
import type { UploadStore } from '../services/upload-store.ts';

export interface AppDependencies {
  readonly graph: GraphWriter;
  readonly rules: RuleRepository;
  readonly uploads: UploadStore;
  readonly explainerFor: ExplainerFactory;
  readonly settings: {
    readonly clashTolerance: number;
    readonly maxUploadBytes: number;
    readonly defaultExplainer: ExplainerKind;
  };
}
