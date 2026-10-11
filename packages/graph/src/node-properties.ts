import type { Element, PropertyValue } from '@bim/core';

export type NodeProperties = Record<string, PropertyValue | readonly string[] | null>;

/**
 * Flattens an element into Neo4j node properties. Property-set keys keep their
 * "<Pset>.<Property>" form; they always contain a dot, so they never collide with
 * the fixed keys. A null value removes a stale property on update.
 */
export function toNodeProperties(element: Element): NodeProperties {
  const box = element.aabb;
  return {
    ...element.properties,
    globalId: element.globalId,
    ifcClass: element.ifcClass,
    ifcSuperClasses: element.ifcSuperClasses,
    category: element.category,
    name: element.name,
    predefinedType: element.predefinedType,
    materials: element.materials,
    minX: box?.minX ?? null,
    minY: box?.minY ?? null,
    minZ: box?.minZ ?? null,
    maxX: box?.maxX ?? null,
    maxY: box?.maxY ?? null,
    maxZ: box?.maxZ ?? null,
  };
}

/** Node labels: the generic :Element plus the IFC class and all its ancestors. */
export function elementLabels(element: Element): string[] {
  return ['Element', element.ifcClass, ...element.ifcSuperClasses];
}
