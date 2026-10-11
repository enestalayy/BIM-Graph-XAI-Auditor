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
