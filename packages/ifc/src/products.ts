import {
  IFCELEMENT, IFCFEATUREELEMENT, IFCVIRTUALELEMENT, IFCSPATIALELEMENT, IFCSPATIALSTRUCTUREELEMENT,
  type IfcAPI,
} from 'web-ifc';
import type { ElementCategory } from '@bim/core';
import type { ClassResolver } from './classes.ts';

export interface ProductRef {
  readonly expressID: number;
  readonly typeCode: number;
  readonly category: ElementCategory;
}

/**
 * Physical elements are IfcElement subtypes except feature elements (openings,
 * projections) and virtual elements, which have no material existence.
 * Spatial elements are IfcSpatialElement (IFC4+) / IfcSpatialStructureElement (IFC2x3) subtypes.
 */
export function listProducts(api: IfcAPI, modelID: number, classes: ClassResolver): ProductRef[] {
  const refs: ProductRef[] = [];
  const seen = new Set<number>();
  const add = (expressID: number, category: ElementCategory): void => {
    if (seen.has(expressID)) return;
    seen.add(expressID);
    refs.push({ expressID, typeCode: api.GetLineType(modelID, expressID), category });
  };

  for (const id of api.GetLineIDsWithType(modelID, IFCELEMENT, true)) {
    const type = api.GetLineType(modelID, id);
    const excluded = type === IFCVIRTUALELEMENT || classes.isSubtypeOf(type, IFCFEATUREELEMENT) || type === IFCFEATUREELEMENT;
    if (!excluded) add(id, 'physical');
  }
  for (const root of [IFCSPATIALELEMENT, IFCSPATIALSTRUCTUREELEMENT]) {
    for (const id of api.GetLineIDsWithType(modelID, root, true)) add(id, 'spatial');
  }
  return refs;
}
