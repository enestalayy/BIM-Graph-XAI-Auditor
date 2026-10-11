import {
  IFCRELCONTAINEDINSPATIALSTRUCTURE, IFCRELAGGREGATES, IFCRELVOIDSELEMENT, IFCRELFILLSELEMENT,
  type IfcAPI,
} from 'web-ifc';
import type { Relation, RelationType } from '@bim/core';
import { linesOfType, refId, refIds } from './lines.ts';

/**
 * Extracts topological relations between extracted products. Relations whose
 * end points are not products (e.g. IfcProject) are skipped by design.
 */
export function collectRelations(api: IfcAPI, modelID: number, guidOf: ReadonlyMap<number, string>): Relation[] {
  const relations: Relation[] = [];
  const push = (type: RelationType, fromId: number | undefined, toId: number | undefined): void => {
    const from = fromId === undefined ? undefined : guidOf.get(fromId);
    const to = toId === undefined ? undefined : guidOf.get(toId);
    if (from && to) relations.push({ type, from, to });
  };

  for (const rel of linesOfType(api, modelID, IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const structure = refId(rel.RelatingStructure);
    for (const element of refIds(rel.RelatedElements)) push('CONTAINED_IN', element, structure);
  }
  for (const rel of linesOfType(api, modelID, IFCRELAGGREGATES)) {
    const whole = refId(rel.RelatingObject);
    for (const part of refIds(rel.RelatedObjects)) push('AGGREGATES', whole, part);
  }

  // A door/window fills an opening that voids its host: filler -HOSTED_BY-> host.
  const hostOfOpening = new Map<number, number>();
  for (const rel of linesOfType(api, modelID, IFCRELVOIDSELEMENT)) {
    const host = refId(rel.RelatingBuildingElement);
    const opening = refId(rel.RelatedOpeningElement);
    if (host !== undefined && opening !== undefined) hostOfOpening.set(opening, host);
  }
  for (const rel of linesOfType(api, modelID, IFCRELFILLSELEMENT)) {
    const opening = refId(rel.RelatingOpeningElement);
    const host = opening === undefined ? undefined : hostOfOpening.get(opening);
    push('HOSTED_BY', refId(rel.RelatedBuildingElement), host);
  }
  return relations;
}
