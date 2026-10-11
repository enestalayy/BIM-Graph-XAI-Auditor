import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createOllamaGenerator } from '../src/index.ts';

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

describe('Ollama generator', () => {
  let handler: Handler;
  let host: string;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => handler(req, body, res));
  });
  const reply = (res: ServerResponse, status: number, payload: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  };

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('posts a deterministic, non-streaming chat request and returns the message content', async () => {
    let sent: any;
    handler = (req, body, res) => {
      assert.equal(req.url, '/api/chat');
      sent = JSON.parse(body);
      reply(res, 200, { message: { role: 'assistant', content: 'Bu bir hatadır çünkü ...' } });
    };
    const generator = createOllamaGenerator({ host, model: 'llama3.1:8b' });
    assert.equal(generator.id, 'ollama:llama3.1:8b');
    assert.equal(await generator.generate({ system: 'S', prompt: 'P' }), 'Bu bir hatadır çünkü ...');
    assert.equal(sent.model, 'llama3.1:8b');
    assert.equal(sent.stream, false);
    assert.deepEqual(sent.options, { temperature: 0, seed: 42 });
    assert.deepEqual(sent.messages.map((m: { role: string }) => m.role), ['system', 'user']);
  });

  it('retries server errors and then succeeds', async () => {
    let calls = 0;
    handler = (_req, _body, res) => (++calls < 3 ? reply(res, 503, { error: 'loading' }) : reply(res, 200, { message: { content: 'ok' } }));
    const generator = createOllamaGenerator({ host, model: 'm', retries: 2, backoffMs: 1 });
    assert.equal(await generator.generate({ system: '', prompt: '' }), 'ok');
    assert.equal(calls, 3);
  });

  it('gives up after the configured retries', async () => {
    handler = (_req, _body, res) => reply(res, 500, { error: 'boom' });
    const generator = createOllamaGenerator({ host, model: 'm', retries: 1, backoffMs: 1 });
    await assert.rejects(generator.generate({ system: '', prompt: '' }), /HTTP 500/);
  });

  it('explains how to fix a missing model', async () => {
    handler = (_req, _body, res) => reply(res, 404, { error: "model 'm' not found" });
    await assert.rejects(createOllamaGenerator({ host, model: 'm' }).generate({ system: '', prompt: '' }), /ollama pull m/);
  });

  it('times out instead of hanging', async () => {
    handler = (_req, _body, res) => setTimeout(() => reply(res, 200, { message: { content: 'late' } }), 300);
    await assert.rejects(createOllamaGenerator({ host, model: 'm', timeoutMs: 50 }).generate({ system: '', prompt: '' }), /did not answer within 50 ms/);
  });

  it('reports an unreachable server', async () => {
    const generator = createOllamaGenerator({ host: 'http://127.0.0.1:1', model: 'm', retries: 0 });
    await assert.rejects(generator.generate({ system: '', prompt: '' }), /Cannot reach Ollama/);
  });
});
