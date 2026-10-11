import type {
  AuditSummary, ExplainerKind, Explanation, IngestOutcome, ModelSummary, Rule, RuleInput, RuleSetInput, Violation, ViolationDetail, Vocabulary,
} from './types.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly issues: readonly string[];

  constructor(message: string, status: number, issues: readonly string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    throw new ApiError(`Sunucuya ulaşılamadı: ${(error as Error).message}`, 0);
  }
  const text = await response.text();
  let body: any = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) throw new ApiError(body?.message ?? response.statusText, response.status, body?.issues ?? []);
  return body as T;
}

const json = (method: string, payload: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

export const api = {
  listModels: () => request<ModelSummary[]>('/api/models'),
  uploadModel(file: File, discipline: string) {
    const form = new FormData();
    form.append('file', file, file.name);
    return request<IngestOutcome>(`/api/models?discipline=${encodeURIComponent(discipline)}`, { method: 'POST', body: form });
  },
  async modelFile(fileName: string): Promise<Uint8Array> {
    const response = await fetch(`/api/models/${encodeURIComponent(fileName)}/file`);
    if (!response.ok) throw new ApiError(`${fileName} indirilemedi`, response.status);
    return new Uint8Array(await response.arrayBuffer());
  },
  vocabulary: () => request<Vocabulary>('/api/vocabulary'),
  getRules: () => request<{ version: 1; rules: Rule[] }>('/api/rules'),
  saveRules: (ruleSet: RuleSetInput) => request<{ version: 1; rules: Rule[] }>('/api/rules', json('PUT', ruleSet)),
  compileRule: (rule: RuleInput) => request<{ cypher: string; params: Record<string, unknown> }>('/api/rules/compile', json('POST', rule)),
  runAudit: () => request<AuditSummary>('/api/audits', { method: 'POST' }),
  listViolations: () => request<Violation[]>('/api/violations'),
  getViolation: (id: string) => request<ViolationDetail>(`/api/violations/${encodeURIComponent(id)}`),
  explain: (id: string, method: ExplainerKind) =>
    request<Explanation>(`/api/violations/${encodeURIComponent(id)}/explanations`, json('POST', { method })),
};
