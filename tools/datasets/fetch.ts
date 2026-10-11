/**
 * Downloads the datasets listed in data/catalog.json and verifies their SHA-256
 * checksums. Files kept in the repository (no "url") are only verified.
 *
 * Usage: npm run datasets:fetch [-- <dataset-id> ...]   (default: all)
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { datasetCatalogSchema } from '@bim/core';

const catalog = datasetCatalogSchema.parse(JSON.parse(await readFile('data/catalog.json', 'utf8')));
const wanted = process.argv.slice(2);
const unknown = wanted.filter((id) => !catalog.datasets.some((d) => d.id === id));
if (unknown.length) {
  console.error(`Unknown dataset(s): ${unknown.join(', ')}. Known: ${catalog.datasets.map((d) => d.id).join(', ')}`);
  process.exit(2);
}

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

async function download(url: string, attempts = 3): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(600_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) throw new Error(`Download failed for ${url}: ${(error as Error).message}`, { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

let failed = false;
for (const dataset of catalog.datasets.filter((d) => wanted.length === 0 || wanted.includes(d.id))) {
  console.log(`\n${dataset.id} — ${dataset.title} (${dataset.license})`);
  for (const file of dataset.files) {
    const existing = await readFile(file.path).catch(() => null);
    if (existing && sha256(existing) === file.sha256) {
      console.log(`  ${file.name}: present, checksum OK`);
      continue;
    }
    if (!file.url) {
      console.error(`  ${file.name}: missing or modified and has no download URL`);
      failed = true;
      continue;
    }
    const data = await download(file.url);
    const actual = sha256(data);
    if (actual !== file.sha256) {
      console.error(`  ${file.name}: checksum mismatch (expected ${file.sha256}, got ${actual}); not saved`);
      failed = true;
      continue;
    }
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, data);
    console.log(`  ${file.name}: downloaded (${(data.byteLength / 1e6).toFixed(1)} MB), checksum OK`);
  }
}
process.exit(failed ? 1 : 0);
