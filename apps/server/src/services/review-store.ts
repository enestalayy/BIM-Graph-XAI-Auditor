import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { BadRequestError, NotFoundError } from '../errors.ts';

/**
 * Human spot-check of reference labels: a fixed sample per dataset
 * (<dir>/<id>-review-sample.json) and the reviewer's verdicts
 * (<dir>/<id>-human-review.json), so agreement can be reported in the thesis.
 */

const sampleSchema = z.object({
  dataset: z.string(),
  seed: z.number(),
  source: z.string(),
  question: z.string(),
  items: z.array(z.object({
    index: z.number().int().positive(),
    ruleId: z.string(),
    elements: z.array(z.string()).min(1).max(2),
    note: z.string(),
  })).min(1),
});

const verdictSchema = z.object({
  verdict: z.enum(['agree', 'disagree', 'unsure']),
  comment: z.string().max(2000).default(''),
});

const reviewFileSchema = z.object({
  dataset: z.string(),
  verdicts: z.record(z.string(), verdictSchema.extend({ reviewedAt: z.string() })),
});

export type Verdict = z.infer<typeof verdictSchema>['verdict'];
type Sample = z.infer<typeof sampleSchema>;

export interface ReviewItem extends Omit<Sample['items'][number], never> {
  readonly verdict: Verdict | null;
  readonly comment: string;
  readonly reviewedAt: string | null;
}

export interface ReviewSummary {
  readonly total: number;
  readonly reviewed: number;
  readonly agree: number;
  readonly disagree: number;
  readonly unsure: number;
  /** agree / (agree + disagree); null until something has been decided. */
  readonly agreement: number | null;
}

export interface Review {
  readonly dataset: string;
  readonly question: string;
  readonly source: string;
  readonly items: readonly ReviewItem[];
  readonly summary: ReviewSummary;
}

export interface ReviewStore {
  load(dataset: string): Promise<Review>;
  record(dataset: string, index: number, input: { verdict: Verdict; comment?: string }): Promise<Review>;
}

const DATASET_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function createReviewStore(directory: string): ReviewStore {
  const paths = (dataset: string) => {
    if (!DATASET_ID.test(dataset)) throw new BadRequestError(`Invalid dataset id "${dataset}"`);
    return { sample: join(directory, `${dataset}-review-sample.json`), review: join(directory, `${dataset}-human-review.json`) };
  };

  async function read(dataset: string) {
    const { sample: samplePath, review: reviewPath } = paths(dataset);
    const sampleRaw = await readFile(samplePath, 'utf8').catch(() => null);
    if (sampleRaw === null) throw new NotFoundError(`No review sample for dataset ${dataset}`);
    const sample = sampleSchema.parse(JSON.parse(sampleRaw));
    const reviewRaw = await readFile(reviewPath, 'utf8').catch(() => null);
    const file = reviewRaw === null ? { dataset, verdicts: {} } : reviewFileSchema.parse(JSON.parse(reviewRaw));
    return { sample, file, reviewPath };
  }

  function toReview(sample: Sample, file: z.infer<typeof reviewFileSchema>): Review {
    const items = sample.items.map((item) => {
      const v = file.verdicts[String(item.index)];
      return { ...item, verdict: v?.verdict ?? null, comment: v?.comment ?? '', reviewedAt: v?.reviewedAt ?? null };
    });
    const count = (verdict: Verdict) => items.filter((i) => i.verdict === verdict).length;
    const [agree, disagree, unsure] = [count('agree'), count('disagree'), count('unsure')];
    return {
      dataset: sample.dataset,
      question: sample.question,
      source: sample.source,
      items,
      summary: {
        total: items.length, reviewed: agree + disagree + unsure, agree, disagree, unsure,
        agreement: agree + disagree === 0 ? null : agree / (agree + disagree),
      },
    };
  }

  return {
    async load(dataset) {
      const { sample, file } = await read(dataset);
      return toReview(sample, file);
    },
    async record(dataset, index, input) {
      const parsed = verdictSchema.safeParse(input);
      if (!parsed.success) throw new BadRequestError('"verdict" must be one of agree, disagree, unsure');
      const { sample, file, reviewPath } = await read(dataset);
      if (!sample.items.some((i) => i.index === index)) throw new NotFoundError(`No item ${index} in the ${dataset} review sample`);
      const next = { dataset, verdicts: { ...file.verdicts, [String(index)]: { ...parsed.data, reviewedAt: new Date().toISOString() } } };
      const temp = `${reviewPath}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`);
      await rename(temp, reviewPath);
      return toReview(sample, next);
    },
  };
}
