export type {
  Aabb,
  Element,
  ElementCategory,
  IfcModel,
  ModelSource,
  PropertyValue,
  Relation,
  RelationType,
} from './model.ts';
export { isOfClass } from './classes.ts';
export { axisOverlaps, center, distanceToBox, interpenetrates, intersectionBox, volume, type Point3 } from './geometry/aabb.ts';
export { findIntersections, type BoxedItem, type Intersection } from './geometry/intersections.ts';
