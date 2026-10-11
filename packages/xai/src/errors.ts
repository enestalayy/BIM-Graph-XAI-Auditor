/** The text-generation backend failed; `kind` lets callers choose a fitting response (e.g. 502 vs 504). */
export class GeneratorError extends Error {
  override name = 'GeneratorError';
  readonly kind: 'unreachable' | 'timeout' | 'bad-response';

  constructor(kind: GeneratorError['kind'], message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.kind = kind;
  }
}
