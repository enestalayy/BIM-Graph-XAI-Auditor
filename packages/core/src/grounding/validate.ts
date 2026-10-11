import { extractCitations, extractEntities, splitSentences, toQuantity, type Entity, type EntityKind, type Quantity } from './entities.ts';

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
  /** Supported entities / all entities; null when the text contains no checkable entity. */
  readonly faithfulness: number | null;
  /**
   * Key evidence entities (GlobalIds, labels, measured quantities of the required
   * facts) that the text mentions / all key entities; null when no facts are required.
   */
  readonly completeness: number | null;
  /** Sentences with valid citations / all sentences. */
  readonly citationCoverage: number;
  /** True when at least one entity is not supported by the evidence. */
  readonly hallucinated: boolean;
  readonly startsWithRequiredPhrase: boolean;
}

export const REQUIRED_OPENING = 'Bu bir hatadır çünkü';

export interface GroundingOptions {
  /** Facts whose key entities a complete explanation should mention. */
  readonly requiredFactIds?: readonly string[];
}

/** Entities that identify or measure something: ids, labels and numbers with a unit. */
function isKeyEntity(entity: Entity): boolean {
  if (entity.kind === 'globalId' || entity.kind === 'label') return true;
  return entity.kind === 'number' && toQuantity(entity.value).dimension !== 'none';
}

/** Leading Markdown emphasis, headings or quotes do not change what the text starts with. */
const stripLeadingDecoration = (text: string): string => text.trimStart().replace(/^[*_#>"'“\s]+/, '');

/**
 * A written number is supported when an evidence number of the same dimension
 * (length, area, volume or unitless) equals it up to the precision it is written
 * with. Units convert within a dimension (m <-> cm <-> mm, m³ <-> L), never across.
 */
function numberSupported(written: string, evidence: readonly Quantity[]): boolean {
  const q = toQuantity(written);
  return evidence.some((e) => e.dimension === q.dimension && Math.abs(e.si - q.si) <= q.halfStep + 1e-12);
}

/**
 * Entity-level grounding check of a generated explanation against the evidence
 * facts it was given: every identifier, rule id, article, label and number in the
 * text must occur in the evidence.
 */
export function validateGrounding(text: string, facts: readonly EvidenceFact[], options: GroundingOptions = {}): GroundingReport {
  const evidence = extractEntities(facts.map((f) => f.statement).join('\n'));
  const allowed = new Map<EntityKind, Set<string>>();
  for (const e of evidence) allowed.set(e.kind, (allowed.get(e.kind) ?? new Set()).add(e.value));
  const evidenceNumbers = [...(allowed.get('number') ?? [])].map(toQuantity);
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

  let completeness: number | null = null;
  if (options.requiredFactIds) {
    const required = new Set(options.requiredFactIds);
    const keys = extractEntities(facts.filter((f) => required.has(f.id)).map((f) => f.statement).join('\n')).filter(isKeyEntity);
    const unique = [...new Map(keys.map((k) => [`${k.kind}|${k.value}`, k])).values()];
    const mentioned = unique.filter((key) => entities.some((e) => e.kind === key.kind &&
      (key.kind === 'number' ? numberSupported(e.value, [toQuantity(key.value)]) : e.value === key.value)));
    completeness = unique.length === 0 ? null : mentioned.length / unique.length;
  }

  return {
    sentences,
    entityCount: entities.length,
    unsupported,
    faithfulness: entities.length === 0 ? null : (entities.length - unsupported.length) / entities.length,
    completeness,
    citationCoverage: sentences.length === 0 ? 0 : sentences.filter((s) => s.validCitations).length / sentences.length,
    hallucinated: unsupported.length > 0,
    startsWithRequiredPhrase: stripLeadingDecoration(text).startsWith(REQUIRED_OPENING),
  };
}
