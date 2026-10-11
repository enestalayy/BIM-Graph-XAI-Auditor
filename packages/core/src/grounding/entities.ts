/**
 * Extraction of verifiable entities from (Turkish or English) explanation text.
 * The same extractor is applied to the evidence and to the generated text, so
 * both sides are tokenised identically.
 */

export type EntityKind = 'globalId' | 'ruleId' | 'article' | 'label' | 'number';

export interface Entity {
  readonly kind: EntityKind;
  /** Normalised value: numbers use "." as decimal separator. */
  readonly value: string;
}

const PATTERNS: ReadonlyArray<readonly [EntityKind, RegExp]> = [
  // IFC GlobalId: 22 characters of the IFC base64 alphabet.
  ['globalId', /(?<![0-9A-Za-z_$])[0-9A-Za-z_$]{22}(?![0-9A-Za-z_$])/g],
  // Rule ids such as FS-DUCT-WALL-01.
  ['ruleId', /(?<![\w-])[A-Z]{2,}(?:-[A-Z0-9]+)+(?![\w-])/g],
  // Article references: "Madde 51", "madde 12/A", "md. 7".
  ['article', /\b(?:[Mm]adde|md\.)\s*(\d+(?:\/[A-Za-z])?)/g],
  // Classification labels mixing capitals and digits: REI30, EI60, EI 60 is not matched on purpose.
  ['label', /(?<![\w$])[A-Z]{1,4}\d{1,4}(?![\w$])/g],
];

const NUMBER = /(?<![\p{L}\d_$.,\/])-?\d+(?:[.,]\d+)?(?![\d_$]|[.,]\d)/gu;
const CITATION = /\[(F\d+)\]/g;

/** Fact citations such as [F2] in order of appearance. */
export function extractCitations(text: string): string[] {
  return [...text.matchAll(CITATION)].map((m) => m[1]!);
}

export function extractEntities(text: string): Entity[] {
  let rest = text.replace(CITATION, ' ');
  const entities: Entity[] = [];
  for (const [kind, pattern] of PATTERNS) {
    rest = rest.replace(pattern, (match, group?: unknown) => {
      entities.push({ kind, value: kind === 'article' && typeof group === 'string' ? group : match });
      return ' '; // mask so that digits inside ids are not read as numbers
    });
  }
  for (const match of rest.matchAll(NUMBER)) entities.push({ kind: 'number', value: match[0].replace(',', '.') });
  return entities;
}

/** Splits text into sentences; decimal points are not followed by whitespace, so they are kept. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}
