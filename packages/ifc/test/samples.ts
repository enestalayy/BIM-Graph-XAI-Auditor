import { readFile } from 'node:fs/promises';
import type { IfcModel } from '@bim/core';
import { parseIfc } from '../src/index.ts';

const SAMPLE_DIR = new URL('../../../data/sample/', import.meta.url);

export async function loadSample(fileName: string, discipline: string): Promise<IfcModel> {
  const data = await readFile(new URL(fileName, SAMPLE_DIR));
  return parseIfc(new Uint8Array(data), { fileName, discipline });
}
