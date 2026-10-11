import { GeneratorError } from './errors.ts';
import type { GenerateRequest, TextGenerator } from './generator.ts';

export interface OllamaOptions {
  readonly host: string;
  readonly model: string;
  /** Per attempt. Local models can be slow on their first (cold) call. */
  readonly timeoutMs?: number;
  /** Extra attempts after network errors, HTTP 429 or 5xx. Timeouts are not retried. */
  readonly retries?: number;
  /** Fixed seed and temperature 0 make runs repeatable for evaluation. */
  readonly seed?: number;
  readonly fetchImpl?: typeof fetch;
  readonly backoffMs?: number;
}

class RetryableError extends GeneratorError {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reasoning models may prepend a <think>…</think> block; it is not part of the explanation. */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

const isTimeout = (error: unknown) => (error as Error)?.name === 'TimeoutError';

/** Text generator backed by a local Ollama server (POST /api/chat). */
export function createOllamaGenerator(options: OllamaOptions): TextGenerator {
  const { host, model, timeoutMs = 180_000, retries = 2, seed = 42, fetchImpl = fetch, backoffMs = 500 } = options;
  const url = new URL('/api/chat', host).toString();

  async function attempt(request: GenerateRequest): Promise<string> {
    let response: Response;
    let body: string;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.prompt },
          ],
          options: { temperature: 0, seed },
        }),
        signal,
      });
      body = await response.text(); // the timeout also covers reading the body
    } catch (error) {
      if (isTimeout(error)) throw new GeneratorError('timeout', `Ollama did not answer within ${timeoutMs} ms`, { cause: error });
      throw new RetryableError('unreachable', `Cannot reach Ollama at ${host}; is "ollama serve" running?`, { cause: error });
    }
    if (response.status === 404) throw new GeneratorError('bad-response', `Ollama model "${model}" not found; run "ollama pull ${model}"`);
    if (response.status === 429 || response.status >= 500) throw new RetryableError('bad-response', `Ollama returned HTTP ${response.status}: ${body}`);
    if (!response.ok) throw new GeneratorError('bad-response', `Ollama returned HTTP ${response.status}: ${body}`);
    let content: unknown;
    try {
      content = (JSON.parse(body) as { message?: { content?: unknown } }).message?.content;
    } catch (error) {
      throw new GeneratorError('bad-response', 'Ollama returned a response that is not JSON', { cause: error });
    }
    const text = typeof content === 'string' ? stripReasoning(content) : '';
    if (text === '') throw new GeneratorError('bad-response', 'Ollama returned an empty answer');
    return text;
  }

  return {
    id: `ollama:${model}`,
    async generate(request) {
      for (let attemptNo = 0; ; attemptNo++) {
        try {
          return await attempt(request);
        } catch (error) {
          if (!(error instanceof RetryableError) || attemptNo >= retries) throw error;
          await sleep(backoffMs * 2 ** attemptNo);
        }
      }
    },
  };
}
