import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findIntersections, interpenetrates } from '@bim/core';
import { CASE_KINDS, generateInjectionScenario } from '../src/evaluation/fault-injection.ts';

describe('fault-injection scenario', () => {
  it('is reproducible for a seed and different across seeds', () => {
    const a = generateInjectionScenario(7, 40);
    assert.deepEqual(generateInjectionScenario(7, 40).cases, a.cases);
    assert.notDeepEqual(generateInjectionScenario(8, 40).cases.map((c) => c.kind), a.cases.map((c) => c.kind));
  });

  it('covers every case kind in a large enough scenario', () => {
    const kinds = new Set(generateInjectionScenario(1, 120).cases.map((c) => c.kind));
    assert.deepEqual([...kinds].sort(), [...CASE_KINDS].sort());
  });

  it('keeps clear geometric margins: crossings penetrate the wall, near misses stay apart', () => {
    const scenario = generateInjectionScenario(3, 120);
    const elements = new Map(scenario.models.flatMap((m) => m.elements).map((e) => [e.globalId, e]));
    for (const c of scenario.cases) {
      const duct = elements.get(c.ductId)!.aabb!;
      const wall = elements.get(c.wallId)!.aabb!;
      if (c.kind === 'near-miss') assert.equal(interpenetrates(duct, wall, 0.1), false, c.ductId);
      else assert.equal(interpenetrates(duct, wall, 0.1), true, c.ductId);
    }
  });

  it('never lets a duct touch a wall of another slot', () => {
    const scenario = generateInjectionScenario(5, 60);
    const elements = scenario.models.flatMap((m) => m.elements).filter((e) => e.aabb);
    const hits = findIntersections(elements.map((e) => ({ id: e.globalId, aabb: e.aabb! })), 0.001);
    const own = new Map(scenario.cases.map((c) => [c.ductId, c.wallId]));
    for (const hit of hits) {
      const duct = hit.a.startsWith('duct') ? hit.a : hit.b.startsWith('duct') ? hit.b : null;
      const other = duct === hit.a ? hit.b : hit.a;
      if (duct && other.includes('wall')) assert.equal(own.get(duct), other, `${duct} crosses foreign ${other}`);
    }
  });

  it('expects violations exactly for the violating kinds', () => {
    const scenario = generateInjectionScenario(9, 50);
    assert.equal(scenario.expected.length, scenario.cases.filter((c) => ['no-damper', 'damper-far', 'wrong-damper'].includes(c.kind)).length);
  });
});
