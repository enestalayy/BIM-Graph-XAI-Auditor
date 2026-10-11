export interface GenerateRequest {
  readonly system: string;
  readonly prompt: string;
}

/** A text-generation backend (local or remote LLM). */
export interface TextGenerator {
  /** Stable identifier recorded with every explanation, e.g. "ollama:llama3.1:8b". */
  readonly id: string;
  generate(request: GenerateRequest): Promise<string>;
}
