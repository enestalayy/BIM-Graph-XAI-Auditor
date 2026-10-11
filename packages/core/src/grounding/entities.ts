/**
 * Extraction of verifiable entities from (Turkish or English) explanation text.
 * The same extractor is applied to the evidence and to the generated text, so
 * both sides are tokenised identically.
 */

export type EntityKind = 'globalId' | 'ruleId' | 'article' | 'label' | 'number';

export type Dimension = 'none' | 'length' | 'area' | 'volume';

export interface Entity {
  readonly kind: EntityKind;
  /** As written, normalised: "." as decimal separator, labels upper-cased, numbers with their unit. */
  readonly value: string;
}

export interface Quantity {
  /** Value converted to SI (m, m², m³); unitless numbers unchanged. */
  readonly si: number;
  readonly dimension: Dimension;
  /** Half of the last written digit, in SI: the rounding a writer may have applied. */
  readonly halfStep: number;
}

const UNITS: Readonly<Record<string, { dimension: Dimension; factor: number }>> = {
  'm³': { dimension: 'volume', factor: 1 },
  L: { dimension: 'volume', factor: 1e-3 },
  litre: { dimension: 'volume', factor: 1e-3 },
  'm²': { dimension: 'area', factor: 1 },
  mm: { dimension: 'length', factor: 1e-3 },
  cm: { dimension: 'length', factor: 1e-2 },
  m: { dimension: 'length', factor: 1 },
  metre: { dimension: 'length', factor: 1 },
};

const PATTERNS: ReadonlyArray<readonly [EntityKind, RegExp]> = [
  // IFC GlobalId: 22 characters of the IFC base64 alphabet.
  ['globalId', /(?<![0-9A-Za-z_$])[0-9A-Za-z_$]{22}(?![0-9A-Za-z_$])/g],
  // Rule ids such as FS-DUCT-WALL-01 or R-01.
  ['ruleId', /(?<![\w-])[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+(?![\w-])/g],
  // Article references: "Madde 51", "madde 12/A", "md. 7".
  ['article', /(?:\b[Mm]adde|\b[Mm]d\.)\s*(\d+(?:\/[A-Za-z])?)/g],
  // Classification labels mixing letters and digits: REI30, EI60 (case-insensitive).
  ['label', /(?<![\w$])[A-Za-z]{1,4}\d{1,4}(?![\w$])/g],
];

const NUMBER = /(?<![\p{L}\d_$.,\/])-?\d+(?:[.,]\d+)?(?![\d_$]|[.,]\d)(?:\s*(m³|m²|mm|cm|metre|litre|m|L)(?![\p{L}\d³²]))?/gu;
const CITATION = /\[(F\d+)\]/g;
const ABBREVIATIONS = new Set(['md', 'vb', 'vs', 'örn', 'bkz', 'no', 'yy']);

/** Fact citations such as [F2] in order of appearance. */
export function extractCitations(text: string): string[] {
  return [...text.matchAll(CITATION)].map((m) => m[1]!);
}

export function extractEntities(text: string): Entity[] {
  let rest = text.replace(CITATION, ' ');
  const entities: Entity[] = [];
  for (const [kind, pattern] of PATTERNS) {
    rest = rest.replace(pattern, (match, group?: unknown) => {
      if (kind === 'article' && typeof group === 'string') entities.push({ kind, value: group });
      else entities.push({ kind, value: kind === 'label' ? match.toUpperCase() : match });
      return ' '; // mask so that digits inside ids are not read as numbers
    });
  }
  for (const match of rest.matchAll(NUMBER)) {
    const number = match[0].replace(/\s*(m³|m²|mm|cm|metre|litre|m|L)$/u, '').replace(',', '.');
    entities.push({ kind: 'number', value: match[1] ? `${number} ${match[1]}` : number });
  }
  return entities;
}

/** Interprets a number entity value ("0.129 m³", "194 cm", "3") as an SI quantity. */
export function toQuantity(value: string): Quantity {
  const [number = '', unit] = value.split(' ');
  const decimals = number.includes('.') ? number.split('.')[1]!.length : 0;
  const { dimension, factor } = unit ? UNITS[unit]! : { dimension: 'none' as const, factor: 1 };
  return { si: Number(number) * factor, dimension, halfStep: 0.5 * 10 ** -decimals * factor };
}

/**
 * Splits text into sentences. A full stop does not end a sentence when it follows
 * a known abbreviation ("md.") or a bare integer used as an ordinal ("1. Kat");
 * decimal points are not followed by whitespace, so they never split.
 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?](?=\s+)/g)) {
    const before = text.slice(start, match.index);
    const lastWord = /([\p{L}\d]+)$/u.exec(before)?.[1] ?? '';
    if (match[0] === '.' && (ABBREVIATIONS.has(lastWord.toLowerCase()) || /^\d+$/.test(lastWord))) continue;
    sentences.push(text.slice(start, match.index + 1));
    start = match.index + 1;
  }
  sentences.push(text.slice(start));
  return sentences.map((s) => s.trim()).filter((s) => s.length > 0);
}
