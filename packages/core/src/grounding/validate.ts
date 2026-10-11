import { extractCitations, extractEntities, splitSentences, type Entity, type EntityKind } from './entities.ts';

export interface EvidenceFact {
  readonly id: string;
  readonly statement: string;
}

export interface EntityCheck extends Entity {
  readonly supported: boolean;
}

export interface SentenceCheck {
  readonly text: string;
  readonly citations: readonly string[];
  /** At least one citation, and every cited fact exists. */
  readonly validCitations: boolean;
  readonly entities: readonly EntityCheck[];
}

export interface GroundingReport {
  readonly sentences: readonly SentenceCheck[];
  readonly entityCount: number;
  readonly unsupported: readonly Entity[];
  /** Supported entities / all entities (1 when the text contains no entity). */
  readonly faithfulness: number;
  /** Sentences with valid citations / all sentences. */
  readonly citationCoverage: number;
  /** True when at least one entity is not supported by the evidence. */
  readonly hallucinated: boolean;
  readonly startsWithRequiredPhrase: boolean;
}

export const REQUIRED_OPENING = 'Bu bir hatadır çünkü';

/**
 * Unit conversions a writer may legitimately apply to evidence values
 * (m -> cm, m -> mm, m³ -> L). A number is supported when it equals an
 * evidence value times one of these factors, up to the precision it is written with.
 */
const CONVERSION_FACTORS = [1, 100, 1000] as const;

function numberSupported(written: string, evidence: readonly number[]): boolean {
  const value = Number(written);
  const decimals = written.includes('.') ? written.split('.')[1]!.length : 0;
  const halfStep = 0.5 * 10 ** -decimals + 1e-9;
  return evidence.some((e) => CONVERSION_FACTORS.some((f) => Math.abs(e * f - value) <= halfStep));
}

/**
 * Entity-level grounding check of a generated explanation against the evidence
 * facts it was given: every identifier, rule id, article, label and number in the
 * text must occur in the evidence.
 */
export function validateGrounding(text: string, facts: readonly EvidenceFact[]): GroundingReport {
  const evidence = extractEntities(facts.map((f) => f.statement).join('\n'));
  const allowed = new Map<EntityKind, Set<string>>();
  for (const e of evidence) allowed.set(e.kind, (allowed.get(e.kind) ?? new Set()).add(e.value));
  const evidenceNumbers = [...(allowed.get('number') ?? [])].map(Number);
  const factIds = new Set(facts.map((f) => f.id));

  const isSupported = (entity: Entity): boolean =>
    entity.kind === 'number' ? numberSupported(entity.value, evidenceNumbers) : (allowed.get(entity.kind)?.has(entity.value) ?? false);

  const sentences: SentenceCheck[] = splitSentences(text).map((sentence) => {
    const citations = extractCitations(sentence);
    return {
      text: sentence,
      citations,
      validCitations: citations.length > 0 && citations.every((c) => factIds.has(c)),
      entities: extractEntities(sentence).map((e) => ({ ...e, supported: isSupported(e) })),
    };
  });

  const entities = sentences.flatMap((s) => s.entities);
  const unsupported = entities.filter((e) => !e.supported).map(({ kind, value }) => ({ kind, value }));
  return {
    sentences,
    entityCount: entities.length,
    unsupported,
    faithfulness: entities.length === 0 ? 1 : (entities.length - unsupported.length) / entities.length,
    citationCoverage: sentences.length === 0 ? 0 : sentences.filter((s) => s.validCitations).length / sentences.length,
    hallucinated: unsupported.length > 0,
    startsWithRequiredPhrase: text.trimStart().startsWith(REQUIRED_OPENING),
  };
}
