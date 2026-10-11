import { IFCMATERIAL, IFCRELASSOCIATESMATERIAL, type IfcAPI } from 'web-ifc';
import { linesOfType, plain, refId, refIds } from './lines.ts';

/** Collects IfcMaterial names nested anywhere inside a flattened material definition. */
function materialNames(node: unknown, names: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) materialNames(item, names);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if ('expressID' in node && 'type' in node && node.type === IFCMATERIAL) {
    const name = plain((node as { Name?: unknown }).Name);
    if (name !== null) names.add(String(name));
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') materialNames(value, names);
  }
}

/**
 * Material names per element from IfcRelAssociatesMaterial (layer sets, lists,
 * constituent and profile sets included). An occurrence without its own material
 * inherits the material of its type object.
 */
export function collectMaterials(api: IfcAPI, modelID: number, typeOf: ReadonlyMap<number, number>): Map<number, string[]> {
  const direct = new Map<number, string[]>();
  for (const rel of linesOfType(api, modelID, IFCRELASSOCIATESMATERIAL)) {
    const materialId = refId(rel.RelatingMaterial);
    if (materialId === undefined) continue;
    const names = new Set<string>();
    materialNames(api.GetLine(modelID, materialId, true), names);
    for (const objectId of refIds(rel.RelatedObjects)) {
      direct.set(objectId, [...new Set([...(direct.get(objectId) ?? []), ...names])]);
    }
  }
  const result = new Map(direct);
  for (const [occurrence, typeId] of typeOf) {
    const inherited = direct.get(typeId);
    if (!result.has(occurrence) && inherited) result.set(occurrence, inherited);
  }
  return result;
}
