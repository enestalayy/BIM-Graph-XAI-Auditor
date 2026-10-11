import { IFCRELDEFINESBYTYPE, type IfcAPI } from 'web-ifc';
import { linesOfType, refId, refIds } from './lines.ts';

/** Maps each occurrence express id to the express id of its type object (IfcRelDefinesByType). */
export function readTypeAssignments(api: IfcAPI, modelID: number): Map<number, number> {
  const typeOf = new Map<number, number>();
  for (const rel of linesOfType(api, modelID, IFCRELDEFINESBYTYPE)) {
    const typeId = refId(rel.RelatingType);
    if (typeId === undefined) continue;
    for (const occurrence of refIds(rel.RelatedObjects)) typeOf.set(occurrence, typeId);
  }
  return typeOf;
}
