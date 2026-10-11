import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { connectGraph, ensureSchema, readDisposableGraphConfig, type GraphClient } from '@bim/graph';
import { buildApp } from '../../src/http/app.ts';
import { loadCatalog } from '../../src/services/datasets.ts';
import { createExplainerFactory } from '../../src/services/explainers.ts';
import { fileURLToPath } from 'node:url';
import { createReviewStore } from '../../src/services/review-store.ts';
import { createFileRuleRepository } from '../../src/services/rule-repository.ts';
import { createUploadStore } from '../../src/services/upload-store.ts';

const ROOT = new URL('../../../../', import.meta.url);
const SKIP = process.env.NEO4J_TEST_URI ? false : 'NEO4J_TEST_URI is not set (docker compose --profile test up -d neo4j-test)';

function multipart(fileName: string, data: Buffer): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----bim-test-boundary';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
  return {
    payload: Buffer.concat([Buffer.from(head), data, Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('HTTP API end to end', { skip: SKIP }, () => {
  let graph: GraphClient;
  let app: FastifyInstance;

  before(async () => {
    graph = await connectGraph(readDisposableGraphConfig());
    await graph.run('MATCH (n) DETACH DELETE n');
    await ensureSchema(graph);
    const work = await mkdtemp(join(tmpdir(), 'bim-api-'));
    const rulesFile = join(work, 'rules.json');
    await copyFile(new URL('rules/default.json', ROOT), rulesFile);
    await copyFile(new URL('evaluation/gold/duplex-review-sample.json', ROOT), join(work, 'duplex-review-sample.json'));
    app = await buildApp({
      graph,
      rules: createFileRuleRepository(rulesFile),
      uploads: createUploadStore(join(work, 'uploads')),
      explainerFor: createExplainerFactory({ ollama: { host: 'http://127.0.0.1:1', model: 'none', timeoutMs: 1000 } }),
      catalog: await loadCatalog(fileURLToPath(new URL('data/catalog.json', ROOT))),
      reviews: createReviewStore(work),
      settings: { clashTolerance: 0.001, maxUploadBytes: 50 * 1024 * 1024, defaultExplainer: 'template', dataRoot: fileURLToPath(ROOT) },
    });
  });
  after(async () => {
    await app?.close();
    await graph?.close();
  });

  it('reports health', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
  });

  it('ingests uploaded IFC files and lists them', async () => {
    for (const [fileName, discipline] of [['Building-Architecture.ifc', 'ARCH'], ['Building-Hvac.ifc', 'MEP']]) {
      const data = await readFile(new URL(`data/sample/${fileName}`, ROOT));
      const response = await app.inject({ method: 'POST', url: `/api/models?discipline=${discipline}`, ...multipart(fileName!, data) });
      assert.equal(response.statusCode, 201, response.body);
    }
    const models = (await app.inject({ method: 'GET', url: '/api/models' })).json();
    assert.deepEqual(models.map((m: { discipline: string }) => m.discipline), ['ARCH', 'MEP']);
    const file = await app.inject({ method: 'GET', url: '/api/models/Building-Hvac.ifc/file' });
    assert.equal(file.statusCode, 200);
    assert.ok(file.rawPayload.toString('latin1').startsWith('ISO-10303-21'));
  });

  it('serves the vocabulary of the federated model', async () => {
    const vocabulary = (await app.inject({ method: 'GET', url: '/api/vocabulary' })).json();
    assert.ok(vocabulary.classes.includes('IfcWall'));
    assert.ok(vocabulary.propertyKeys.includes('Pset_SlabCommon.FireRating'));
  });

  it('rejects an upload without a discipline', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/models', ...multipart('a.ifc', Buffer.from('ISO-10303-21;')) });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /discipline/);
  });

  it('rejects a file that is not IFC by name', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/models?discipline=ARCH', ...multipart('model.exe', Buffer.from('MZ')) });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /Invalid IFC file name/);
  });

  it('rejects a file that is not IFC by content', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/models?discipline=ARCH', ...multipart('fake.ifc', Buffer.from('hello')) });
    assert.equal(response.statusCode, 400);
    assert.match(response.json().message, /not an IFC STEP file/);
  });

  it('returns 400 with the validation issues for an invalid rule set and keeps the stored one', async () => {
    const response = await app.inject({ method: 'PUT', url: '/api/rules', payload: { version: 1, rules: [{ id: 'bad' }] } });
    assert.equal(response.statusCode, 400);
    assert.ok(response.json().issues.length > 0);
    const shipped = JSON.parse(await readFile(new URL('rules/default.json', ROOT), 'utf8')).rules.length;
    assert.equal((await app.inject({ method: 'GET', url: '/api/rules' })).json().rules.length, shipped);
  });

  it('compiles a rule for preview without saving it', async () => {
    const rule = (await app.inject({ method: 'GET', url: '/api/rules' })).json().rules[1];
    const response = await app.inject({ method: 'POST', url: '/api/rules/compile', payload: rule });
    assert.equal(response.statusCode, 200);
    assert.match(response.json().cypher, /INTERSECTS_WITH/);
  });

  it('runs an audit, lists violations and serves one with its context', async () => {
    const audit = await app.inject({ method: 'POST', url: '/api/audits' });
    assert.equal(audit.statusCode, 201);
    assert.equal(audit.json().violations.length, 5); // 4 walls without FireRating + duct x roof slab
    const violations = (await app.inject({ method: 'GET', url: '/api/violations' })).json();
    assert.equal(violations.length, 5);
    const detail = await app.inject({ method: 'GET', url: `/api/violations/${encodeURIComponent(violations[0].id)}` });
    assert.equal(detail.statusCode, 200);
    assert.ok(detail.json().rule.id);
    assert.equal((await app.inject({ method: 'GET', url: '/api/violations/nope' })).statusCode, 404);
  });

  it('explains a violation with the template explainer and stores the explanation', async () => {
    const [violation] = (await app.inject({ method: 'GET', url: '/api/violations' })).json();
    const url = `/api/violations/${encodeURIComponent(violation.id)}/explanations`;
    const response = await app.inject({ method: 'POST', url, payload: { method: 'template' } });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().grounding.faithfulness, 1);
    const detail = (await app.inject({ method: 'GET', url: `/api/violations/${encodeURIComponent(violation.id)}` })).json();
    assert.equal(detail.explanations.length, 1);
    assert.equal((await app.inject({ method: 'POST', url, payload: { method: 'gpt' } })).statusCode, 400);
  });

  it('reports an unreachable LLM as a bad gateway with a clear message', async () => {
    const [violation] = (await app.inject({ method: 'GET', url: '/api/violations' })).json();
    const response = await app.inject({
      method: 'POST', url: `/api/violations/${encodeURIComponent(violation.id)}/explanations`, payload: { method: 'ollama' },
    });
    assert.equal(response.statusCode, 502);
    assert.match(response.json().message, /Cannot reach Ollama/);
  });

  it('lists the catalog datasets with their local availability', async () => {
    const body = (await app.inject({ method: 'GET', url: '/api/datasets' })).json();
    const scene = body.datasets.find((d: { id: string }) => d.id === 'buildingsmart-scene');
    assert.equal(scene.available, true);
    assert.ok(body.datasets.length >= 2);
  });

  it('loads a dataset into the working graph, audits it and marks it active', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/datasets/buildingsmart-scene/activate' });
    assert.equal(response.statusCode, 201, response.body);
    const result = response.json();
    assert.deepEqual(result.models.map((m: { fileName: string }) => m.fileName), ['Building-Architecture.ifc', 'Building-Hvac.ifc']);
    assert.equal(result.audit.violations.length, 5);
    assert.equal((await app.inject({ method: 'GET', url: '/api/datasets' })).json().active, 'buildingsmart-scene');
    assert.equal((await app.inject({ method: 'GET', url: '/api/models' })).json().length, 2);
  });

  it('rejects an unknown dataset', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/datasets/nope/activate' })).statusCode, 404);
  });

  it('serves the human review sample and records verdicts', async () => {
    const review = (await app.inject({ method: 'GET', url: '/api/reviews/duplex' })).json();
    assert.equal(review.items.length, 20);
    const saved = await app.inject({ method: 'PUT', url: '/api/reviews/duplex/1', payload: { verdict: 'agree', comment: 'görüldü' } });
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().summary.agree, 1);
    assert.equal((await app.inject({ method: 'PUT', url: '/api/reviews/duplex/1', payload: { verdict: 'maybe' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'GET', url: '/api/reviews/clinic' })).statusCode, 404);
  });
});
