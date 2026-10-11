import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { createReviewStore } from '../src/services/review-store.ts';

const SAMPLE = {
  dataset: 'demo', seed: 1, source: 'x', question: 'q',
  items: [
    { index: 1, ruleId: 'R-1', elements: ['a'], note: 'n1' },
    { index: 2, ruleId: 'R-2', elements: ['b', 'c'], note: 'n2' },
  ],
};

describe('review store', () => {
  let dir: string;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'review-'));
    await writeFile(join(dir, 'demo-review-sample.json'), JSON.stringify(SAMPLE));
  });

  it('returns the sample with no verdicts before any review', async () => {
    const review = await createReviewStore(dir).load('demo');
    assert.equal(review.items.length, 2);
    assert.equal(review.items[0]!.verdict, null);
    assert.deepEqual(review.summary, { total: 2, reviewed: 0, agree: 0, disagree: 0, unsure: 0, agreement: null });
  });

  it('records verdicts persistently and summarises agreement over decided items', async () => {
    const store = createReviewStore(dir);
    await store.record('demo', 1, { verdict: 'agree', comment: 'ok' });
    await store.record('demo', 2, { verdict: 'disagree', comment: '' });
    const review = await createReviewStore(dir).load('demo');
    assert.equal(review.items[0]!.verdict, 'agree');
    assert.equal(review.summary.agreement, 0.5);
    const saved = JSON.parse(await readFile(join(dir, 'demo-human-review.json'), 'utf8'));
    assert.equal(saved.verdicts['1'].verdict, 'agree');
  });

  it('rejects unknown items, unknown datasets and invalid verdicts', async () => {
    const store = createReviewStore(dir);
    await assert.rejects(store.record('demo', 99, { verdict: 'agree', comment: '' }), /No item 99/);
    await assert.rejects(store.load('nope'), /No review sample/);
    await assert.rejects(store.record('demo', 1, { verdict: 'maybe' as never, comment: '' }), /verdict/);
  });

  it('rejects dataset ids that could escape the directory', async () => {
    await assert.rejects(createReviewStore(dir).load('../etc'), /Invalid dataset id/);
  });
});
