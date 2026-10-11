import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { compileRule, parseRule, parseRuleSet, RuleValidationError, toViolations, type RuleInput } from '../src/index.ts';

const regulation = { source: 'Test', article: null };
const ductThroughFireWall: RuleInput = {
  id: 'T-1', kind: 'intersection', title: 'Duct through fire wall', severity: 'critical', regulation,
  subject: { classes: ['IfcDuctSegment'] },
  object: { classes: ['IfcWall'], where: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }] },
  mitigation: { classes: ['IfcDamper'], where: [{ property: 'predefinedType', op: 'eq', value: 'FIREDAMPER' }], maxDistance: 0.5 },
};

describe('rule schema', () => {
  it('accepts the shipped default rule set', async () => {
    const json = JSON.parse(await readFile(new URL('../../../rules/default.json', import.meta.url), 'utf8'));
    assert.ok(parseRuleSet(json).rules.length > 0);
  });

  it('applies defaults (enabled, verified, empty where, minVolume)', () => {
    const rule = parseRule(ductThroughFireWall);
    assert.equal(rule.enabled, true);
    assert.equal(rule.regulation.verified, false);
    assert.ok(rule.kind === 'intersection');
    assert.deepEqual(rule.subject.where, []);
    assert.equal(rule.minVolume, 0);
  });

  it('rejects class names that are not IFC classes and reports the path', () => {
    const bad = { ...ductThroughFireWall, subject: { classes: ['Duct'] } };
    assert.throws(() => parseRule(bad), (error: unknown) =>
      error instanceof RuleValidationError && error.issues.some((i) => i.startsWith('subject.classes.0')));
  });

  it('rejects unknown operators, unknown fields and comparisons without a value', () => {
    const where = (condition: object) => ({ ...ductThroughFireWall, object: { classes: ['IfcWall'], where: [condition] } });
    assert.throws(() => parseRule(where({ property: 'name', op: 'like', value: 'x' })), RuleValidationError);
    assert.throws(() => parseRule(where({ property: 'name', op: 'eq' })), RuleValidationError);
    assert.throws(() => parseRule({ ...ductThroughFireWall, extra: true }), RuleValidationError);
  });

  it('rejects property keys that are neither fixed keys nor Pset keys', () => {
    assert.throws(() => parseRule({
      ...ductThroughFireWall, kind: 'property', target: { classes: ['IfcWall'] }, require: [{ property: 'globalId', op: 'exists' }],
    }), RuleValidationError);
  });

  it('rejects duplicate rule ids in a set', () => {
    assert.throws(() => parseRuleSet({ version: 1, rules: [ductThroughFireWall, ductThroughFireWall] }), /Duplicate rule id T-1/);
  });
});

describe('compileRule', () => {
  it('passes every value as a parameter, never in the query text', () => {
    const injection = "x' OR 1=1 //";
    const rule = parseRule({
      id: 'T-2', kind: 'property', title: 't', severity: 'minor', regulation,
      target: { classes: ['IfcDoor'] }, require: [{ property: 'Pset_DoorCommon.FireRating', op: 'eq', value: injection }],
    });
    const { cypher, params } = compileRule(rule);
    assert.ok(!cypher.includes(injection));
    assert.ok(Object.values(params).includes(injection));
  });

  it('quotes Pset keys and uses class labels for selectors (subtypes included)', () => {
    const { cypher } = compileRule(parseRule(ductThroughFireWall));
    assert.match(cypher, /o:`IfcWall`/);
    assert.match(cypher, /o\.`Pset_WallCommon\.FireRating` IS NOT NULL/);
    assert.match(cypher, /OPTIONAL MATCH \(m:Element\)/);
  });

  it('omits the mitigation search when the rule has none', () => {
    const { mitigation: _, ...plainClash } = ductThroughFireWall as Extract<RuleInput, { kind: 'intersection' }>;
    const { cypher } = compileRule(parseRule(plainClash));
    assert.ok(!cypher.includes('OPTIONAL MATCH'));
  });
});

describe('toViolations', () => {
  it('builds deterministic ids and collapses both orientations of a symmetric pair', () => {
    const rule = parseRule({ ...ductThroughFireWall, subject: { classes: ['IfcElement'] }, object: { classes: ['IfcElement'] } });
    const ref = (globalId: string) => ({ globalId, ifcClass: 'IfcWall', name: null });
    const x = { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1, volume: 1, depth: 1 };
    const rows = [
      { subject: ref('A'), object: ref('B'), intersection: x, centre: { x: 0.5, y: 0.5, z: 0.5 }, nearestMitigation: null },
      { subject: ref('B'), object: ref('A'), intersection: x, centre: { x: 0.5, y: 0.5, z: 0.5 }, nearestMitigation: null },
    ];
    const violations = toViolations(rule, rows);
    assert.equal(violations.length, 1);
    assert.equal(violations[0]!.id, 'T-1:A:B');
  });
});

describe('compileRule: identifiers from user input', () => {
  it('keeps a hostile property key inside a quoted identifier', () => {
    const rule = parseRule({
      id: 'T-3', kind: 'property', title: 't', severity: 'minor', regulation: { source: 'x', article: null },
      target: { classes: ['IfcWall'] },
      require: [{ property: 'Pset_X.a` IS NULL OR true //', op: 'exists' }],
    });
    const { cypher } = compileRule(rule);
    assert.ok(cypher.includes('t.`Pset_X.a`` IS NULL OR true //` IS NOT NULL'));
  });
});
