import type { Aabb, Element, IfcModel } from '@bim/core';

/**
 * Seeded fault-injection scenario for the duct-through-fire-wall rule.
 *
 * Fire walls (EI60) and unrated walls are laid out in rows; every case places one
 * duct in its own slot. The expected outcome of each case follows from how it is
 * constructed, never from the system under test, and every case keeps a clear
 * margin from all thresholds (tolerance, maxDistance) so that the ground truth is
 * unambiguous:
 *   - crossing, no damper                -> violation
 *   - crossing, fire damper at crossing  -> no violation  (0.15 m from the centre)
 *   - crossing, fire damper too far      -> violation     (1.2 m from the centre)
 *   - crossing, damper of the wrong type -> violation     (BLASTDAMPER at the crossing)
 *   - duct passing 0.15 m beside a wall  -> no violation  (no intersection)
 *   - crossing an unrated wall           -> no violation  (not a fire wall)
 */
export type CaseKind = 'no-damper' | 'damper-near' | 'damper-far' | 'wrong-damper' | 'near-miss' | 'unrated-wall';

export const CASE_KINDS: readonly CaseKind[] = ['no-damper', 'damper-near', 'damper-far', 'wrong-damper', 'near-miss', 'unrated-wall'];
const VIOLATING: ReadonlySet<CaseKind> = new Set(['no-damper', 'damper-far', 'wrong-damper']);

export interface InjectedCase {
  readonly kind: CaseKind;
  readonly ductId: string;
  readonly wallId: string;
  readonly expectedViolation: boolean;
}

export interface InjectionScenario {
  readonly seed: number;
  readonly models: readonly IfcModel[];
  readonly cases: readonly InjectedCase[];
  /** Expected violation ids of the evaluated rule. */
  readonly expected: readonly string[];
}

const SLOTS_PER_WALL = 10;
const SLOT_SPACING = 2; // m; larger than 2 x maxDistance so dampers never serve a neighbouring slot
const WALL_PITCH = 10; // m between wall rows
const WALL_THICKNESS = 0.2;

const BUILT = ['IfcBuiltElement', 'IfcElement'];
const SEGMENT = ['IfcFlowSegment', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement'];
const CONTROLLER = ['IfcFlowController', 'IfcDistributionFlowElement', 'IfcDistributionElement', 'IfcElement'];

function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const box = (minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): Aabb => ({ minX, minY, minZ, maxX, maxY, maxZ });

function element(globalId: string, ifcClass: string, ifcSuperClasses: string[], aabb: Aabb, extra: Partial<Element> = {}): Element {
  return { globalId, ifcClass, ifcSuperClasses, category: 'physical', name: globalId, predefinedType: null, properties: {}, materials: [], aabb, ...extra };
}

export function generateInjectionScenario(seed: number, caseCount: number, ruleId = 'FS-DUCT-WALL-01'): InjectionScenario {
  if (!Number.isInteger(caseCount) || caseCount < 1) throw new Error(`caseCount must be a positive integer, got ${caseCount}`);
  const random = prng(seed);
  const walls: Element[] = [];
  const mep: Element[] = [];
  const cases: InjectedCase[] = [];
  const wallFor = new Map<string, Element>();

  const wallAt = (row: number, rated: boolean): Element => {
    const id = `${rated ? 'firewall' : 'wall'}-${row}`;
    let wall = wallFor.get(id);
    if (!wall) {
      const y = row * WALL_PITCH;
      wall = element(id, 'IfcWall', BUILT, box(0, y, 0, SLOTS_PER_WALL * SLOT_SPACING, y + WALL_THICKNESS, 3),
        rated ? { properties: { 'Pset_WallCommon.FireRating': 'EI60' } } : {});
      wallFor.set(id, wall);
      walls.push(wall);
    }
    return wall;
  };

  for (let i = 0; i < caseCount; i++) {
    const kind = CASE_KINDS[Math.floor(random() * CASE_KINDS.length)]!;
    const row = Math.floor(i / SLOTS_PER_WALL);
    const x = (i % SLOTS_PER_WALL) * SLOT_SPACING + 1;
    // Unrated walls get their own rows, offset by half a pitch from the fire walls.
    const wall = wallAt(kind === 'unrated-wall' ? row + 0.5 : row, kind !== 'unrated-wall');
    const wy = wall.aabb!.minY;
    const ductId = `duct-${String(i).padStart(3, '0')}`;
    const z = [1, 1.3] as const;

    if (kind === 'near-miss') {
      mep.push(element(ductId, 'IfcDuctSegment', SEGMENT, box(x - 0.1, wy + WALL_THICKNESS + 0.15, z[0], x + 0.1, wy + 2, z[1])));
    } else {
      mep.push(element(ductId, 'IfcDuctSegment', SEGMENT, box(x - 0.1, wy - 1, z[0], x + 0.1, wy + 1.2, z[1])));
    }
    if (kind === 'damper-near') {
      mep.push(element(`damper-${i}`, 'IfcDamper', CONTROLLER, box(x - 0.15, wy + 0.25, z[0], x + 0.15, wy + 0.45, z[1]), { predefinedType: 'FIREDAMPER' }));
    }
    if (kind === 'damper-far') {
      mep.push(element(`damper-${i}`, 'IfcDamper', CONTROLLER, box(x - 0.15, wy + 1.3, z[0], x + 0.15, wy + 1.5, z[1]), { predefinedType: 'FIREDAMPER' }));
    }
    if (kind === 'wrong-damper') {
      mep.push(element(`damper-${i}`, 'IfcDamper', CONTROLLER, box(x - 0.15, wy + 0.25, z[0], x + 0.15, wy + 0.45, z[1]), { predefinedType: 'BLASTDAMPER' }));
    }
    cases.push({ kind, ductId, wallId: wall.globalId, expectedViolation: VIOLATING.has(kind) });
  }

  const source = (fileName: string, discipline: string) => ({ fileName, schema: 'IFC4', discipline });
  return {
    seed,
    models: [
      { source: source(`injection-${seed}-arch.ifc`, 'ARCH'), elements: walls, relations: [], warnings: [] },
      { source: source(`injection-${seed}-mep.ifc`, 'MEP'), elements: mep, relations: [], warnings: [] },
    ],
    cases,
    expected: cases.filter((c) => c.expectedViolation).map((c) => `${ruleId}:${[c.ductId, c.wallId].sort().join(':')}`),
  };
}
