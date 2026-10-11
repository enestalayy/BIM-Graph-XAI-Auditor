import { z } from 'zod';
import { isIfcClassName } from '../cypher/identifiers.ts';

/** Fixed element keys that rules may test, besides "<Pset>.<Property>" keys. */
export const FIXED_PROPERTY_KEYS = ['name', 'predefinedType', 'ifcClass', 'category'] as const;

const PSET_KEY = /^[^.\p{Cc}]+\.[^\p{Cc}]+$/u;

const propertyKey = z
  .string()
  .max(128)
  .refine((key) => (FIXED_PROPERTY_KEYS as readonly string[]).includes(key) || PSET_KEY.test(key), {
    message: `Expected one of ${FIXED_PROPERTY_KEYS.join(', ')} or a "<Pset>.<Property>" key`,
  });

const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const conditionSchema = z.union([
  z.object({ property: propertyKey, op: z.enum(['exists', 'notExists']) }).strict(),
  z.object({ property: propertyKey, op: z.enum(['eq', 'neq']), value: scalar }).strict(),
  z.object({ property: propertyKey, op: z.enum(['gt', 'gte', 'lt', 'lte']), value: z.number() }).strict(),
  z.object({ property: propertyKey, op: z.literal('in'), value: z.array(z.union([z.string(), z.number()])).min(1) }).strict(),
  z.object({ property: propertyKey, op: z.literal('contains'), value: z.string().min(1) }).strict(),
]);

const ifcClass = z.string().refine(isIfcClassName, { message: 'Expected an IFC class name such as "IfcWall"' });

/** Matches elements of any of the classes (subtypes included) that satisfy every condition. */
export const selectorSchema = z
  .object({
    classes: z.array(ifcClass).min(1),
    where: z.array(conditionSchema).default([]),
  })
  .strict();

const regulationSchema = z
  .object({
    source: z.string().min(1),
    /** Article reference; null until it has been looked up in the regulation text. */
    article: z.string().min(1).nullable(),
    /** Stays false until a person has checked the article against the official text. */
    verified: z.boolean().default(false),
    note: z.string().optional(),
  })
  .strict();

const ruleBase = {
  id: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,40}$/, 'Use upper-case letters, digits, "-" or "_" (e.g. FS-INT-01)'),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  severity: z.enum(['critical', 'major', 'minor']),
  enabled: z.boolean().default(true),
  regulation: regulationSchema,
};

/** Every element matched by `target` must satisfy every `require` condition. */
export const propertyRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal('property'),
    target: selectorSchema,
    require: z.array(conditionSchema).min(1),
  })
  .strict();

/**
 * Every intersection between a `subject` and an `object` element is a violation,
 * unless a `mitigation` element lies within `maxDistance` of the intersection centre.
 */
export const intersectionRuleSchema = z
  .object({
    ...ruleBase,
    kind: z.literal('intersection'),
    subject: selectorSchema,
    object: selectorSchema,
    /** Ignore intersections smaller than this volume, m³. */
    minVolume: z.number().nonnegative().default(0),
    mitigation: selectorSchema
      .extend({ maxDistance: z.number().nonnegative() })
      .strict()
      .optional(),
  })
  .strict();

export const ruleSchema = z.discriminatedUnion('kind', [propertyRuleSchema, intersectionRuleSchema]);

export const ruleSetSchema = z
  .object({
    version: z.literal(1),
    rules: z.array(ruleSchema),
  })
  .strict()
  .superRefine((set, ctx) => {
    const seen = new Set<string>();
    set.rules.forEach((rule, index) => {
      if (seen.has(rule.id)) ctx.addIssue({ code: 'custom', message: `Duplicate rule id ${rule.id}`, path: ['rules', index, 'id'] });
      seen.add(rule.id);
    });
  });

export type Condition = z.infer<typeof conditionSchema>;
export type Selector = z.infer<typeof selectorSchema>;
export type PropertyRule = z.infer<typeof propertyRuleSchema>;
export type IntersectionRule = z.infer<typeof intersectionRuleSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type RuleSet = z.infer<typeof ruleSetSchema>;
/** Rule as authored (defaults not yet applied). */
export type RuleInput = z.input<typeof ruleSchema>;
