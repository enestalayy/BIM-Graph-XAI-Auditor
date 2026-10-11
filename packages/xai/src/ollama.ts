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

class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Text generator backed by a local Ollama server (POST /api/chat). */
export function createOllamaGenerator(options: OllamaOptions): TextGenerator {
  const { host, model, timeoutMs = 180_000, retries = 2, seed = 42, fetchImpl = fetch, backoffMs = 500 } = options;
  const url = new URL('/api/chat', host).toString();

  async function attempt(request: GenerateRequest): Promise<string> {
    let response: Response;
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
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new Error(`Ollama did not answer within ${timeoutMs} ms`, { cause: error });
      throw new RetryableError(`Cannot reach Ollama at ${host}; is "ollama serve" running?`, { cause: error });
    }
    const body = await response.text();
    if (response.status === 404) throw new Error(`Ollama model "${model}" not found; run "ollama pull ${model}"`);
    if (response.status === 429 || response.status >= 500) throw new RetryableError(`Ollama returned HTTP ${response.status}: ${body}`);
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}: ${body}`);
    const content = (JSON.parse(body) as { message?: { content?: unknown } }).message?.content;
    if (typeof content !== 'string' || content.trim() === '') throw new Error('Ollama returned an empty answer');
    return content;
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
