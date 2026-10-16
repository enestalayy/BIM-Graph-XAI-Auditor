import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Violation } from '../src/api/types.ts';
import { changeOperator, newRule, nextRuleId, parseConditionValue } from '../src/lib/rule-draft.ts';
import { countBySeverity, sortViolations } from '../src/lib/severity.ts';

describe('rule drafts', () => {
  it('picks the smallest free rule id', () => {
    assert.equal(nextRuleId(['R-01', 'R-03']), 'R-02');
    assert.equal(nextRuleId([]), 'R-01');
  });

  it('creates complete skeletons for both rule kinds', () => {
    const property = newRule('property', ['R-01']);
    assert.equal(property.id, 'R-02');
    assert.equal(property.kind, 'property');
    assert.equal(newRule('intersection', []).kind, 'intersection');
  });

  it('parses condition values according to the operator', () => {
    assert.equal(parseConditionValue('gte', '0,5'), 0.5);
    assert.ok(Number.isNaN(parseConditionValue('gt', 'abc')));
    assert.deepEqual(parseConditionValue('in', 'EI60, EI90'), ['EI60', 'EI90']);
    assert.equal(parseConditionValue('eq', 'FIREDAMPER'), 'FIREDAMPER');
    assert.equal(parseConditionValue('contains', ' 60 '), '60');
  });

  it('keeps numeric-looking text as text unless the property is numeric', () => {
    assert.equal(parseConditionValue('eq', '60', 'string'), '60');
    assert.equal(parseConditionValue('eq', '60'), '60');
    assert.equal(parseConditionValue('eq', '0,2', 'number'), 0.2);
    assert.deepEqual(parseConditionValue('in', '30, 60', 'number'), [30, 60]);
  });

  it('reads booleans for boolean properties', () => {
    assert.equal(parseConditionValue('eq', 'true', 'boolean'), true);
    assert.equal(parseConditionValue('eq', 'false'), false);
    assert.equal(parseConditionValue('eq', 'true', 'string'), 'true');
  });

  it('drops the value when switching to an operator without one and keeps it otherwise', () => {
    assert.deepEqual(changeOperator({ property: 'name', op: 'eq', value: 'x' }, 'exists'), { property: 'name', op: 'exists' });
    assert.deepEqual(changeOperator({ property: 'name', op: 'eq', value: 'x' }, 'contains'), { property: 'name', op: 'contains', value: 'x' });
  });
});

describe('severity helpers', () => {
  const v = (id: string, severity: Violation['severity'], ruleId = 'R'): Violation =>
    ({ id, ruleId, severity, subject: { globalId: id, ifcClass: 'IfcWall', name: null }, object: null, evidence: { kind: 'property', failures: [] } });

  it('orders critical first and is stable by rule and id', () => {
    assert.deepEqual(sortViolations([v('b', 'minor'), v('a', 'critical'), v('c', 'minor', 'A')]).map((x) => x.id), ['a', 'c', 'b']);
  });

  it('counts by severity', () => {
    assert.deepEqual(countBySeverity([v('a', 'critical'), v('b', 'minor'), v('c', 'minor')]), { critical: 1, major: 0, minor: 2 });
  });
});

describe('coreBoxIndices', () => {
  it('ignores far-away outliers when framing the camera', async () => {
    const { coreBoxIndices } = await import('../src/viewer/robust-bounds.ts');
    const unit = (x: number) => ({ min: [x, 0, 0] as const, max: [x + 1, 1, 1] as const });
    const boxes = [...Array.from({ length: 20 }, (_, i) => unit(i)), unit(-5000)];
    const core = coreBoxIndices(boxes);
    assert.ok(!core.includes(20));
    assert.ok(core.length >= 16);
  });
});

describe('Turkish IFC class names', () => {
  it('names common classes and falls back to the IFC name', async () => {
    const { turkishClassName, classHint } = await import('../src/lib/ifc-names.ts');
    assert.equal(turkishClassName('IfcWallStandardCase'), 'Duvar');
    assert.equal(turkishClassName('IfcFlowSegment'), 'Tesisat hattı');
    assert.equal(turkishClassName('IfcSomethingNew'), 'IfcSomethingNew');
    assert.match(classHint('IfcDamper'), /yangında kapanır/);
  });
});

describe('groupByRule', () => {
  it('groups findings per rule, most severe rule first, keeping counts', async () => {
    const { groupByRule } = await import('../src/lib/group-violations.ts');
    const mk = (id: string, ruleId: string, severity: Violation['severity']): Violation =>
      ({ id, ruleId, severity, subject: { globalId: id, ifcClass: 'IfcWall', name: null }, object: null, evidence: { kind: 'property', failures: [] } });
    const groups = groupByRule([mk('a', 'INFO', 'minor'), mk('b', 'FS', 'critical'), mk('c', 'INFO', 'minor')]);
    assert.deepEqual(groups.map((g) => [g.ruleId, g.violations.length]), [['FS', 1], ['INFO', 2]]);
  });
});

describe('coverage sentences', () => {
  const regulation = { source: 'x', article: null, verified: false };
  const duct = {
    id: 'D', kind: 'intersection', title: 't', severity: 'critical', enabled: true, regulation, minVolume: 0,
    subject: { classes: ['IfcDuctSegment'], where: [] },
    object: { classes: ['IfcWall'], where: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }] },
    mitigation: { classes: ['IfcDamper'], where: [], maxDistance: 0.5 },
  } as const;
  const outcome = (status: string, counts: Record<string, number>, violations = 0) =>
    ({ ruleId: 'D', violations, durationMs: 1, coverage: { status, counts } }) as never;

  it('explains why a rule could not be checked', async () => {
    const { coverageSentence } = await import('../src/lib/coverage-text.ts');
    const text = coverageSentence(duct as never, outcome('insufficient-data', { subjects: 2, objects: 0, objectClassMembers: 57, pairs: 0, mitigations: 0 }));
    assert.equal(text, 'Denetlenemedi: modelde 57 Duvar var ama hiçbirinde gerekli bilgi (FireRating) yok.');
  });

  it('states the examined counts for findings', async () => {
    const { coverageSentence } = await import('../src/lib/coverage-text.ts');
    const text = coverageSentence(duct as never, outcome('violations', { subjects: 3, objects: 1, objectClassMembers: 2, pairs: 2, mitigations: 1 }, 1));
    assert.match(text, /3 Hava kanalı ile 1 Duvar arasında 2 kesişim incelendi, 1 ihlal bulundu\./);
  });

  it('orders violations before not-checkable, compliant and not-applicable rules', async () => {
    const { sortOutcomes } = await import('../src/lib/coverage-text.ts');
    const o = (ruleId: string, status: string) => ({ ruleId, violations: 0, durationMs: 0, coverage: { status, counts: {} } }) as never;
    const sorted = sortOutcomes([o('A', 'not-applicable'), o('B', 'compliant'), o('C', 'violations'), o('D', 'insufficient-data')], new Map());
    assert.deepEqual(sorted.map((x: { ruleId: string }) => x.ruleId), ['C', 'D', 'B', 'A']);
  });
});
