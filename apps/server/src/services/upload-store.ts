import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SAFE_IFC_NAME = /^[\w\-. ()]{1,200}\.ifc$/i;

/** Accepts plain IFC file names only; rejects paths, traversal and other extensions. */
export function assertSafeIfcFileName(fileName: string): string {
  if (!SAFE_IFC_NAME.test(fileName) || fileName.startsWith('.')) {
    throw new Error(`Invalid IFC file name "${fileName}": use letters, digits, spaces, "-", "_", "." and the .ifc extension`);
  }
  return fileName;
}

export interface UploadStore {
  save(fileName: string, data: Uint8Array): Promise<void>;
  read(fileName: string): Promise<Uint8Array>;
}

export function createUploadStore(directory: string): UploadStore {
  return {
    async save(fileName, data) {
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, assertSafeIfcFileName(fileName)), data);
    },
    async read(fileName) {
      return new Uint8Array(await readFile(join(directory, assertSafeIfcFileName(fileName))));
    },
  };
}
