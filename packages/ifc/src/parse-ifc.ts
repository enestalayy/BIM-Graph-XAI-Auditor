import type { Element, IfcModel } from '@bim/core';
import { getIfcApi } from './api.ts';
import { createClassResolver } from './classes.ts';
import { computeAabbs } from './geometry.ts';
import { plain } from './lines.ts';
import { collectMaterials } from './materials.ts';
import { listProducts } from './products.ts';
import { collectProperties } from './properties.ts';
import { collectRelations } from './relations.ts';
import { readTypeAssignments } from './type-assignments.ts';
import { readUnitScales } from './units.ts';

export interface ParseOptions {
  readonly fileName: string;
  /** Discipline label stored with the model, e.g. "ARCH" or "MEP". */
  readonly discipline: string;
}

/**
 * Parses an IFC file into the domain model. Coordinates are kept in the file's
 * own world frame (no re-centring) so that models of one project can be federated.
 */
export async function parseIfc(data: Uint8Array, options: ParseOptions): Promise<IfcModel> {
  if (data.byteLength === 0) throw new Error(`Empty IFC file: ${options.fileName}`);
  const api = await getIfcApi();
  const modelID = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
  if (modelID < 0) throw new Error(`web-ifc could not open ${options.fileName}`);

  try {
    const schema = api.GetModelSchema(modelID);
    const classes = createClassResolver(api, schema);
    const scales = readUnitScales(api, modelID);
    const typeOf = readTypeAssignments(api, modelID);
    const properties = collectProperties(api, modelID, typeOf, scales);
    const materials = collectMaterials(api, modelID, typeOf);
    const boxes = computeAabbs(api, modelID);

    const warnings: string[] = [];
    const elements: Element[] = [];
    const guidOf = new Map<number, string>();
    const seenGuids = new Set<string>();

    for (const product of listProducts(api, modelID, classes)) {
      const line = api.GetLine(modelID, product.expressID);
      const globalId = plain(line.GlobalId);
      if (typeof globalId !== 'string' || globalId.length === 0) {
        warnings.push(`#${product.expressID} has no GlobalId and was skipped`);
        continue;
      }
      if (seenGuids.has(globalId)) {
        warnings.push(`Duplicate GlobalId ${globalId} at #${product.expressID} was skipped`);
        continue;
      }
      seenGuids.add(globalId);
      guidOf.set(product.expressID, globalId);
      const name = plain(line.Name);
      const predefinedType = plain(line.PredefinedType);
      elements.push({
        globalId,
        ifcClass: classes.nameOf(product.typeCode),
        ifcSuperClasses: classes.superClassesOf(product.typeCode),
        category: product.category,
        name: name === null ? null : String(name),
        predefinedType: predefinedType === null ? null : String(predefinedType),
        properties: properties.get(product.expressID) ?? {},
        materials: materials.get(product.expressID) ?? [],
        aabb: boxes.get(product.expressID) ?? null,
      });
    }

    return {
      source: { fileName: options.fileName, schema, discipline: options.discipline },
      elements,
      relations: collectRelations(api, modelID, guidOf),
      warnings,
    };
  } finally {
    api.CloseModel(modelID);
  }
}
