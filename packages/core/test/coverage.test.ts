import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compileCoverage, coverageStatus, parseRule } from '../src/index.ts';

const regulation = { source: 'x', article: null };
const ductRule = parseRule({
  id: 'D-1', kind: 'intersection', title: 't', severity: 'critical', regulation,
  subject: { classes: ['IfcDuctSegment'] },
  object: { classes: ['IfcWall'], where: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }] },
  mitigation: { classes: ['IfcDamper'], where: [], maxDistance: 0.5 },
});
const wallRule = parseRule({
  id: 'W-1', kind: 'property', title: 't', severity: 'minor', regulation,
  target: { classes: ['IfcWall'] }, require: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }],
});

describe('compileCoverage', () => {
  it('counts subjects, objects (with and without conditions), examined pairs and mitigation candidates', () => {
    const { cypher, params } = compileCoverage(ductRule);
    for (const column of ['subjects', 'objects', 'objectClassMembers', 'pairs', 'mitigations']) assert.match(cypher, new RegExp(`AS ${column}`));
    assert.ok(Object.values(params).includes(0)); // minVolume passed as a parameter
  });

  it('counts targets with and without conditions for property rules', () => {
    const { cypher } = compileCoverage(wallRule);
    assert.match(cypher, /AS targets/);
    assert.match(cypher, /AS targetClassMembers/);
  });
});

describe('coverageStatus', () => {
  it('reports insufficient data when no element satisfies the object conditions although the class exists', () => {
    assert.equal(coverageStatus(ductRule, { subjects: 2, objects: 0, objectClassMembers: 57, pairs: 0, mitigations: 0 }, 0), 'insufficient-data');
  });

  it('treats a selection condition (e.g. a name) that matches nothing as not applicable, not as missing data', () => {
    const partyWall = parseRule({
      id: 'P-1', kind: 'intersection', title: 't', severity: 'major', regulation,
      subject: { classes: ['IfcFlowSegment'] },
      object: { classes: ['IfcWall'], where: [{ property: 'name', op: 'contains', value: 'Party Wall' }] },
    });
    assert.equal(coverageStatus(partyWall, { subjects: 60, objects: 0, objectClassMembers: 934, pairs: 0, mitigations: 0 }, 0), 'not-applicable');
  });

  it('reports not applicable when the model has no subject or no object class at all', () => {
    assert.equal(coverageStatus(ductRule, { subjects: 0, objects: 3, objectClassMembers: 3, pairs: 0, mitigations: 0 }, 0), 'not-applicable');
    assert.equal(coverageStatus(ductRule, { subjects: 2, objects: 0, objectClassMembers: 0, pairs: 0, mitigations: 0 }, 0), 'not-applicable');
  });

  it('reports compliant when the rule could be checked and found nothing, violations otherwise', () => {
    assert.equal(coverageStatus(ductRule, { subjects: 2, objects: 3, objectClassMembers: 3, pairs: 0, mitigations: 0 }, 0), 'compliant');
    assert.equal(coverageStatus(ductRule, { subjects: 2, objects: 3, objectClassMembers: 3, pairs: 4, mitigations: 1 }, 2), 'violations');
    assert.equal(coverageStatus(wallRule, { targets: 10, targetClassMembers: 10 }, 0), 'compliant');
    assert.equal(coverageStatus(wallRule, { targets: 0, targetClassMembers: 0 }, 0), 'not-applicable');
    assert.equal(coverageStatus(wallRule, { targets: 10, targetClassMembers: 10 }, 10), 'violations');
  });
});
