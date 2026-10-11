import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { ingestIfc } from '../services/ingest.ts';
import { assertSafeIfcFileName, createUploadStore } from '../services/upload-store.ts';
import { UsageError, type Command } from './command.ts';

export const ingest: Command = async ({ graph, config, args }) => {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { discipline: { type: 'string' } } });
  if (!values.discipline || positionals.length === 0) throw new UsageError('ingest requires --discipline and at least one file');
  const uploads = createUploadStore(config.uploadsDir);
  for (const path of positionals) {
    const fileName = assertSafeIfcFileName(basename(path));
    const data = new Uint8Array(await readFile(path));
    const outcome = await ingestIfc(graph, data, { fileName, discipline: values.discipline.toUpperCase() }, config.clashTolerance);
    await uploads.save(fileName, data); // keep a copy for the web viewer, as the API upload does
    console.log(`${outcome.fileName} [${outcome.schema}, ${outcome.discipline}]: ${outcome.elements} elements, ` +
      `${outcome.relations} relations; federated intersections: ${outcome.intersections}`);
    for (const warning of outcome.warnings) console.warn(`  warning: ${warning}`);
  }
};
