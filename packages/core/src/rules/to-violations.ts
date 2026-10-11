import type { Rule } from './schema.ts';
import type { ElementRef, FailedCheck, Violation } from './violation.ts';

type Row = Record<string, unknown>;

function elementRef(value: unknown): ElementRef {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.globalId !== 'string') throw new Error('Rule query returned a row without an element reference');
  return { globalId: v.globalId, ifcClass: String(v.ifcClass), name: v.name == null ? null : String(v.name) };
}

const num = (value: unknown): number => Number(value);

/**
 * Maps the rows of a compiled rule query to violations. Intersection pairs are
 * de-duplicated because an undirected match yields both orientations when the
 * subject and object selectors overlap.
 */
export function toViolations(rule: Rule, rows: readonly Row[]): Violation[] {
  const violations = new Map<string, Violation>();
  for (const row of rows) {
    const subject = elementRef(row.subject);
    if (rule.kind === 'property') {
      const id = `${rule.id}:${subject.globalId}`;
      violations.set(id, {
        id, ruleId: rule.id, severity: rule.severity, subject, object: null,
        evidence: { kind: 'property', failures: (row.failures as FailedCheck[]) ?? [] },
      });
      continue;
    }
    const object = elementRef(row.object);
    const id = `${rule.id}:${[subject.globalId, object.globalId].sort().join(':')}`;
    if (violations.has(id)) continue;
    const x = row.intersection as Row;
    const centre = row.centre as Row;
    const nearest = row.nearestMitigation as Row | null;
    violations.set(id, {
      id, ruleId: rule.id, severity: rule.severity, subject, object,
      evidence: {
        kind: 'intersection',
        intersection: {
          box: { minX: num(x.minX), minY: num(x.minY), minZ: num(x.minZ), maxX: num(x.maxX), maxY: num(x.maxY), maxZ: num(x.maxZ) },
          volume: num(x.volume),
          depth: num(x.depth),
        },
        centre: { x: num(centre.x), y: num(centre.y), z: num(centre.z) },
        mitigation: rule.mitigation
          ? {
              classes: rule.mitigation.classes,
              maxDistance: rule.mitigation.maxDistance,
              nearest: nearest ? { ...elementRef(nearest), distance: num(nearest.distance) } : null,
            }
          : null,
      },
    });
  }
  return [...violations.values()];
}
