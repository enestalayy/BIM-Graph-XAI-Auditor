/**
 * Parity check: web-ifc (this project) vs IfcOpenShell (reference) on the same IFC files.
 * Compares the set of physical elements, their classes and their AABBs.
 *
 * Usage: node tools/parity/compare.ts <file.ifc> [...more.ifc]
 * Env:   PARITY_PYTHON  python interpreter with ifcopenshell (default: .venv/bin/python)
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import { parseIfc } from '@bim/ifc';

const run = promisify(execFile);
const PYTHON = process.env.PARITY_PYTHON ?? '.venv/bin/python';
const DUMP_SCRIPT = new URL('./ifcopenshell_dump.py', import.meta.url).pathname;
const TOLERANCE_M = 0.001;

interface Reference {
  schema: string;
  elements: Record<string, { ifcClass: string; aabb: number[] | null }>;
}

async function compare(path: string): Promise<boolean> {
  const { stdout } = await run(PYTHON, ['-I', DUMP_SCRIPT, path], { maxBuffer: 256 * 1024 * 1024, timeout: 600_000 });
  const reference = JSON.parse(stdout) as Reference;
  const model = await parseIfc(new Uint8Array(await readFile(path)), { fileName: basename(path), discipline: 'PARITY' });
  const ours = new Map(model.elements.filter((e) => e.category === 'physical').map((e) => [e.globalId, e]));

  const problems: string[] = [];
  let maxDeviation = 0;
  for (const [guid, ref] of Object.entries(reference.elements)) {
    const element = ours.get(guid);
    if (!element) { problems.push(`missing in web-ifc: ${guid} (${ref.ifcClass})`); continue; }
    if (element.ifcClass.toLowerCase() !== ref.ifcClass.toLowerCase()) problems.push(`class differs: ${guid} ${element.ifcClass} vs ${ref.ifcClass}`);
    if ((element.aabb === null) !== (ref.aabb === null)) { problems.push(`geometry presence differs: ${guid} (${ref.ifcClass})`); continue; }
    if (element.aabb && ref.aabb) {
      const a = element.aabb;
      const deviation = Math.max(...[a.minX, a.minY, a.minZ, a.maxX, a.maxY, a.maxZ].map((v, i) => Math.abs(v - ref.aabb![i]!)));
      maxDeviation = Math.max(maxDeviation, deviation);
      if (deviation > TOLERANCE_M) problems.push(`AABB deviates ${(deviation * 1000).toFixed(2)} mm: ${guid} (${ref.ifcClass})`);
    }
  }
  for (const guid of ours.keys()) if (!(guid in reference.elements)) problems.push(`extra in web-ifc: ${guid}`);

  const withGeometry = Object.values(reference.elements).filter((e) => e.aabb).length;
  console.log(`${basename(path)} [${reference.schema}]: ${Object.keys(reference.elements).length} physical elements ` +
    `(${withGeometry} with geometry), max AABB deviation ${(maxDeviation * 1000).toFixed(4)} mm`);
  for (const problem of problems) console.log(`  - ${problem}`);
  return problems.length === 0;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node tools/parity/compare.ts <file.ifc> [...]');
  process.exit(2);
}
let ok = true;
for (const file of files) ok = (await compare(file)) && ok;
console.log(ok ? 'PARITY OK' : 'PARITY FAILED');
process.exit(ok ? 0 : 1);
