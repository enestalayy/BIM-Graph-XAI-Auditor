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
export { extractCitations, extractEntities, splitSentences, toQuantity, type Dimension, type Entity, type EntityKind, type Quantity } from './grounding/entities.ts';
export {
  REQUIRED_OPENING, validateGrounding, type EntityCheck, type EvidenceFact, type GroundingOptions, type GroundingReport, type SentenceCheck,
} from './grounding/validate.ts';
export type { ElementContext, Explanation, ViolationContext } from './explanation.ts';
export { classificationMetrics, metricsByRule, ruleOf, type ClassificationMetrics } from './evaluation/classification.ts';
export { summarizeExplanations, type ExplanationSummary } from './evaluation/explanations.ts';
export { expectedViolationIds, goldStandardSchema, type GoldStandard } from './evaluation/gold-standard.ts';
export { datasetCatalogSchema, datasetSchema, type Dataset, type DatasetCatalog, type DatasetFile } from './datasets/catalog.ts';
