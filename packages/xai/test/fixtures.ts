import { parseRule, type ViolationContext } from '@bim/core';

const regulation = { source: 'Binaların Yangından Korunması Hakkında Yönetmelik (RG 19.12.2007/26735)', article: null };

export const intersectionContext: ViolationContext = {
  rule: parseRule({
    id: 'FS-DUCT-WALL-01', kind: 'intersection', title: 'Yangın dayanımlı duvarı geçen kanalda damper bulunmalı', severity: 'critical', regulation,
    subject: { classes: ['IfcDuctSegment'] },
    object: { classes: ['IfcWall'], where: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }] },
    mitigation: { classes: ['IfcDamper'], where: [{ property: 'predefinedType', op: 'eq', value: 'FIREDAMPER' }], maxDistance: 0.5 },
  }),
  violation: {
    id: 'FS-DUCT-WALL-01:2O2Fr$t4X7Zf8NOew3FLOH:38WbwIGD90nB_3T2BTU5Ed',
    ruleId: 'FS-DUCT-WALL-01',
    severity: 'critical',
    subject: { globalId: '38WbwIGD90nB_3T2BTU5Ed', ifcClass: 'IfcDuctSegment', name: 'supply duct' },
    object: { globalId: '2O2Fr$t4X7Zf8NOew3FLOH', ifcClass: 'IfcWall', name: 'core wall' },
    evidence: {
      kind: 'intersection',
      intersection: { box: { minX: 2.9, minY: 0, minZ: 1, maxX: 3.1, maxY: 0.2, maxZ: 1.2 }, volume: 0.008, depth: 0.2 },
      centre: { x: 3, y: 0.1, z: 1.1 },
      mitigation: {
        classes: ['IfcDamper'], maxDistance: 0.5,
        nearest: { globalId: '0K7w8vXbz1HQJq$ZyEoV2a', ifcClass: 'IfcDamper', name: 'FD-1', distance: 1.9416 },
      },
    },
  },
  elements: {
    '38WbwIGD90nB_3T2BTU5Ed': {
      ref: { globalId: '38WbwIGD90nB_3T2BTU5Ed', ifcClass: 'IfcDuctSegment', name: 'supply duct' },
      properties: {}, containers: ['00 groundfloor'], disciplines: ['MEP'],
    },
    '2O2Fr$t4X7Zf8NOew3FLOH': {
      ref: { globalId: '2O2Fr$t4X7Zf8NOew3FLOH', ifcClass: 'IfcWall', name: 'core wall' },
      properties: { 'Pset_WallCommon.FireRating': 'EI60' }, containers: ['00 groundfloor'], disciplines: ['ARCH'],
    },
  },
};

export const propertyContext: ViolationContext = {
  rule: parseRule({
    id: 'INFO-WALL-01', kind: 'property', title: 'Duvarların yangın dayanım sınıfı tanımlı olmalı', severity: 'minor',
    regulation: { source: 'Bilgi gereksinimi', article: null },
    target: { classes: ['IfcWall'] },
    require: [{ property: 'Pset_WallCommon.FireRating', op: 'exists' }],
  }),
  violation: {
    id: 'INFO-WALL-01:1uS5vfZPn9R8PlAaVd73on',
    ruleId: 'INFO-WALL-01',
    severity: 'minor',
    subject: { globalId: '1uS5vfZPn9R8PlAaVd73on', ifcClass: 'IfcWall', name: 'plumbing wall' },
    object: null,
    evidence: { kind: 'property', failures: [{ property: 'Pset_WallCommon.FireRating', op: 'exists', expected: null, actual: null }] },
  },
  elements: {
    '1uS5vfZPn9R8PlAaVd73on': {
      ref: { globalId: '1uS5vfZPn9R8PlAaVd73on', ifcClass: 'IfcWall', name: 'plumbing wall' },
      properties: {}, containers: ['00 groundfloor'], disciplines: ['ARCH'],
    },
  },
};
