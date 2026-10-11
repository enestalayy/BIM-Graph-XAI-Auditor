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
export { assertIfcClassName, isIfcClassName, quoteIdentifier } from './cypher/identifiers.ts';
export {
  conditionSchema, intersectionRuleSchema, propertyRuleSchema, ruleSchema, ruleSetSchema, selectorSchema, FIXED_PROPERTY_KEYS,
  type Condition, type IntersectionRule, type PropertyRule, type Rule, type RuleInput, type RuleSet, type Selector,
} from './rules/schema.ts';
export { parseRule, parseRuleSet, RuleValidationError } from './rules/parse.ts';
export { compileRule, type CompiledQuery } from './rules/compile.ts';
export { toViolations } from './rules/to-violations.ts';
export type { ElementRef, Evidence, FailedCheck, Violation } from './rules/violation.ts';
