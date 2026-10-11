import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Writes an experiment result as JSON (full data) and Markdown (thesis-ready table); returns both paths. */
export async function writeReport(directory: string, name: string, data: unknown, markdown: string): Promise<{ json: string; md: string }> {
  await mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(directory, `${stamp}-${name}`);
  const paths = { json: `${base}.json`, md: `${base}.md` };
  await writeFile(paths.json, `${JSON.stringify({ name, createdAt: new Date().toISOString(), data }, null, 2)}\n`);
  await writeFile(paths.md, markdown);
  return paths;
}

export const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toFixed(1)} %`);
export const ms = (x: number): string => `${x.toFixed(1)} ms`;
