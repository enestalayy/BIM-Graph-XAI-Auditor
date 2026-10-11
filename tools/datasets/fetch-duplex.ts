/**
 * Downloads the Duplex Apartment test models (architecture + MEP, IFC2x3) into
 * data/duplex and verifies their SHA-256 checksums.
 *
 * Source: BSI (2020) "Duplex Apartment Test Files," buildingSMART International,
 * contributed by Bill East to github.com/buildingSMART/Sample-Test-Files (PR #61,
 * 2020-11). That repository's history was later rewritten, so the files are taken
 * from a fork that preserves the published state, pinned to an exact commit.
 * Licence: CC BY 4.0 — see tools/datasets/README.md.
 *
 * Usage: npm run datasets:duplex
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const COMMIT = 'a859c60342201dd9adcd29990b8b5779e0559db8';
const BASE = `https://raw.githubusercontent.com/jakob-beetz/Sample-Test-Files/${COMMIT}/IFC%202x3/Duplex%20Apartment/`;
const TARGET = 'data/duplex';
const FILES: Readonly<Record<string, string>> = {
  'Duplex_A_20110907.ifc': 'b347a2c8aa8fff6db896a4417a9c50c22ac0ccd7c5cfc22b99b8d29336c606ed',
  'Duplex_MEP_20110907.ifc': '13976a8e223f177a6d7123679e4b02e750cd90c13f7bb20c593be125d9407119',
};

const sha256 = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');

async function fetchWithRetry(url: string, attempts = 3): Promise<Uint8Array> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } catch (error) {
      if (attempt >= attempts) throw new Error(`Download failed for ${url}: ${(error as Error).message}`, { cause: error });
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

await mkdir(TARGET, { recursive: true });
for (const [name, expected] of Object.entries(FILES)) {
  const path = join(TARGET, name);
  const existing = await readFile(path).catch(() => null);
  if (existing && sha256(existing) === expected) {
    console.log(`${name}: already present, checksum OK`);
    continue;
  }
  const data = await fetchWithRetry(BASE + name);
  const actual = sha256(data);
  if (actual !== expected) throw new Error(`${name}: checksum mismatch (expected ${expected}, got ${actual}); file not saved`);
  await writeFile(path, data);
  console.log(`${name}: downloaded (${(data.byteLength / 1e6).toFixed(1)} MB), checksum OK`);
}
