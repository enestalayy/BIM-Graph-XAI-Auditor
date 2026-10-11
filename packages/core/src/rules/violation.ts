import type { Aabb } from '../model.ts';
import type { Point3 } from '../geometry/aabb.ts';
import type { Rule } from './schema.ts';

export interface ElementRef {
  readonly globalId: string;
  readonly ifcClass: string;
  readonly name: string | null;
}

export interface FailedCheck {
  readonly property: string;
  readonly op: string;
  readonly expected: unknown;
  readonly actual: unknown;
}

export type Evidence =
  | { readonly kind: 'property'; readonly failures: readonly FailedCheck[] }
  | {
      readonly kind: 'intersection';
      readonly intersection: { readonly box: Aabb; readonly volume: number; readonly depth: number };
      readonly centre: Point3;
      /** Null when the rule has no mitigation clause. */
      readonly mitigation: null | {
        readonly classes: readonly string[];
        readonly maxDistance: number;
        /** Nearest matching element (beyond maxDistance), or null if the model has none. */
        readonly nearest: (ElementRef & { readonly distance: number }) | null;
      };
    };

export interface Violation {
  /** Deterministic: same rule and elements always give the same id. */
  readonly id: string;
  readonly ruleId: string;
  readonly severity: Rule['severity'];
  readonly subject: ElementRef;
  readonly object: ElementRef | null;
  readonly evidence: Evidence;
}
