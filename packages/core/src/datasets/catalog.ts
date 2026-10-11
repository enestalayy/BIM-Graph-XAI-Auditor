import { z } from 'zod';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'Expected a lowercase hex SHA-256');

export const datasetFileSchema = z
  .object({
    /** File name used as the model key in the graph. */
    name: z.string().regex(/\.ifc$/i),
    discipline: z.string().regex(/^[A-Z][A-Z0-9_-]{0,15}$/),
    /** Local path relative to the repository root. */
    path: z.string().min(1),
    /** Download location; omitted for files kept in the repository. */
    url: z.string().url().optional(),
    sha256,
  })
  .strict();

export const datasetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
    title: z.string().min(1),
    description: z.string().min(1),
    schema: z.string().min(1),
    license: z.string().min(1),
    /** Attribution text required by the licence. */
    attribution: z.string().min(1),
    sourceUrl: z.string().url(),
    files: z.array(datasetFileSchema).min(1),
  })
  .strict();

export const datasetCatalogSchema = z
  .object({ version: z.literal(1), datasets: z.array(datasetSchema).min(1) })
  .strict()
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    catalog.datasets.forEach((d, i) => {
      if (ids.has(d.id)) ctx.addIssue({ code: 'custom', message: `Duplicate dataset id ${d.id}`, path: ['datasets', i, 'id'] });
      ids.add(d.id);
    });
  });

export type DatasetFile = z.infer<typeof datasetFileSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type DatasetCatalog = z.infer<typeof datasetCatalogSchema>;
