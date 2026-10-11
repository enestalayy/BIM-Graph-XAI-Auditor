/**
 * Domain model shared by every layer. All lengths are metres and all
 * coordinates are expressed in the IFC world frame (right-handed, Z up).
 */

export interface Aabb {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

export type PropertyValue = string | number | boolean;

/**
 * physical: subtypes of IfcElement (walls, ducts, doors ...), the clash candidates.
 * spatial:  subtypes of IfcSpatialElement (site, building, storey, space ...).
 */
export type ElementCategory = 'physical' | 'spatial';

export interface Element {
  readonly globalId: string;
  /** Most specific IFC class, e.g. "IfcWallStandardCase". */
  readonly ifcClass: string;
  /** Every ancestor class of ifcClass, e.g. ["IfcWall", "IfcBuiltElement", "IfcElement", ...]. */
  readonly ifcSuperClasses: readonly string[];
  /**
   * IFC4 classes implied by the type object of a generically typed IFC2x3
   * occurrence, e.g. ["IfcDuctSegment"] for an IfcFlowSegment of IfcDuctSegmentType.
   */
  readonly ifcDerivedClasses?: readonly string[];
  /** Class of the element's type object, e.g. "IfcDuctSegmentType". */
  readonly typeClass?: string | null;
  readonly category: ElementCategory;
  readonly name: string | null;
  readonly predefinedType: string | null;
  /** Flattened property sets, keyed "<PsetName>.<PropertyName>". */
  readonly properties: Readonly<Record<string, PropertyValue>>;
  readonly materials: readonly string[];
  /** Null when the element has no body geometry. */
  readonly aabb: Aabb | null;
}

/**
 * CONTAINED_IN: element      -> spatial structure (IfcRelContainedInSpatialStructure)
 * AGGREGATES:   whole        -> part              (IfcRelAggregates)
 * HOSTED_BY:    filling elem -> host element      (IfcRelFillsElement + IfcRelVoidsElement)
 */
export type RelationType = 'CONTAINED_IN' | 'AGGREGATES' | 'HOSTED_BY';

export interface Relation {
  readonly type: RelationType;
  readonly from: string;
  readonly to: string;
}

export interface ModelSource {
  readonly fileName: string;
  readonly schema: string;
  /** Discipline label given at ingest time, e.g. "ARCH" or "MEP". */
  readonly discipline: string;
}

export interface IfcModel {
  readonly source: ModelSource;
  readonly elements: readonly Element[];
  readonly relations: readonly Relation[];
  /** Non-fatal problems found while reading the file (e.g. duplicate GlobalIds). */
  readonly warnings: readonly string[];
}
