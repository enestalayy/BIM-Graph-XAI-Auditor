import type { FastifyInstance } from 'fastify';
import { listModels, loadVocabulary } from '@bim/graph';
import { BadRequestError } from '../../errors.ts';
import { ingestIfc } from '../../services/ingest.ts';
import { assertSafeIfcFileName } from '../../services/upload-store.ts';
import type { AppDependencies } from '../dependencies.ts';

const DISCIPLINE = /^[A-Z][A-Z0-9_-]{0,15}$/;

export function registerModelRoutes(app: FastifyInstance, deps: AppDependencies): void {
  app.get('/api/models', async () => listModels(deps.graph));

  /** Classes and property keys present in the federated model, for the rule editor. */
  app.get('/api/vocabulary', async () => loadVocabulary(deps.graph));

  /** multipart/form-data with one "file" part; ?discipline=ARCH|MEP|... */
  app.post<{ Querystring: { discipline?: string } }>('/api/models', async (request, reply) => {
    const discipline = (request.query.discipline ?? '').toUpperCase();
    if (!DISCIPLINE.test(discipline)) throw new BadRequestError('Query parameter "discipline" is required, e.g. ARCH or MEP');
    const file = await request.file();
    if (!file) throw new BadRequestError('No IFC file in the request');
    let fileName: string;
    try {
      fileName = assertSafeIfcFileName(file.filename);
    } catch (error) {
      throw new BadRequestError((error as Error).message);
    }
    const data = new Uint8Array(await file.toBuffer());
    const outcome = await ingestIfc(deps.graph, data, { fileName, discipline }, deps.settings.clashTolerance);
    await deps.uploads.save(fileName, data);
    return reply.code(201).send(outcome);
  });

  app.get<{ Params: { fileName: string } }>('/api/models/:fileName/file', async (request, reply) => {
    let data: Uint8Array;
    try {
      data = await deps.uploads.read(request.params.fileName);
    } catch {
      return reply.code(404).send({ error: 'not_found', message: `No stored file named ${request.params.fileName}` });
    }
    return reply.type('application/octet-stream').send(Buffer.from(data));
  });
}
