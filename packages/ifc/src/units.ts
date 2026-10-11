import { IFCUNITASSIGNMENT, IFCSIUNIT, IFCCONVERSIONBASEDUNIT, type IfcAPI } from 'web-ifc';
import { linesOfType, plain, refId, refIds } from './lines.ts';

export interface UnitScales {
  /** Multiply a value in model units by this factor to get metres. */
  readonly length: number;
  /** ... to get square metres. */
  readonly area: number;
  /** ... to get cubic metres. */
  readonly volume: number;
}

const SI_PREFIX: Readonly<Record<string, number>> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 1e1,
  DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

const DIMENSION: Readonly<Record<string, number>> = { LENGTHUNIT: 1, AREAUNIT: 2, VOLUMEUNIT: 3 };

/** Scale of an SI unit to its base unit; the prefix applies to the base length, hence the power. */
export function siUnitScale(unitType: string, prefix: string | null): number {
  const dimension = DIMENSION[unitType] ?? 1;
  const factor = prefix ? SI_PREFIX[prefix] : 1;
  if (factor === undefined) throw new Error(`Unknown SI prefix: ${prefix}`);
  return factor ** dimension;
}

/** Reads length/area/volume scales from the project's IfcUnitAssignment (SI default: 1). */
export function readUnitScales(api: IfcAPI, modelID: number): UnitScales {
  const scales = { length: 1, area: 1, volume: 1 };
  const target: Readonly<Record<string, keyof UnitScales>> = { LENGTHUNIT: 'length', AREAUNIT: 'area', VOLUMEUNIT: 'volume' };

  const scaleOf = (unitId: number): { unitType: string; scale: number } | undefined => {
    const unit = api.GetLine(modelID, unitId);
    const unitType = String(plain(unit.UnitType));
    if (unit.type === IFCSIUNIT) return { unitType, scale: siUnitScale(unitType, plain(unit.Prefix) as string | null) };
    if (unit.type === IFCCONVERSIONBASEDUNIT) {
      const measure = api.GetLine(modelID, refId(unit.ConversionFactor) ?? -1);
      const baseId = refId(measure?.UnitComponent);
      const base = baseId === undefined ? undefined : scaleOf(baseId);
      const value = Number(plain(measure?.ValueComponent));
      if (base && Number.isFinite(value)) return { unitType, scale: value * base.scale };
    }
    return undefined;
  };

  for (const assignment of linesOfType(api, modelID, IFCUNITASSIGNMENT)) {
    for (const unitId of refIds(assignment.Units)) {
      const unit = scaleOf(unitId);
      const key = unit && target[unit.unitType];
      if (unit && key) scales[key] = unit.scale;
    }
  }
  return scales;
}
