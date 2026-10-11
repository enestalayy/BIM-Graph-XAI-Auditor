import {
  IFCPROPERTYSET, IFCPROPERTYSINGLEVALUE, IFCPROPERTYENUMERATEDVALUE, IFCRELDEFINESBYPROPERTIES,
  type IfcAPI,
} from 'web-ifc';
import type { PropertyValue } from '@bim/core';
import { linesOfType, plain, refIds } from './lines.ts';
import type { UnitScales } from './units.ts';

type Properties = Record<string, PropertyValue>;

const MEASURE_SCALE: Readonly<Record<string, keyof UnitScales>> = {
  IFCLENGTHMEASURE: 'length',
  IFCPOSITIVELENGTHMEASURE: 'length',
  IFCNONNEGATIVELENGTHMEASURE: 'length',
  IFCAREAMEASURE: 'area',
  IFCVOLUMEMEASURE: 'volume',
};

/** Converts a wrapped IFC measure ({ name: 'IFCLABEL', value }) to a plain value in SI units. */
export function toPropertyValue(measure: unknown, scales: UnitScales): PropertyValue | null {
  const value = plain(measure);
  if (value === null) return null;
  const name = measure && typeof measure === 'object' && 'name' in measure ? String(measure.name) : '';
  if (name === 'IFCLOGICAL' || name === 'IFCBOOLEAN') {
    if (value === 'T' || value === true) return true;
    if (value === 'F' || value === false) return false;
    return null; // UNKNOWN logical
  }
  const scaleKey = MEASURE_SCALE[name];
  if (scaleKey && typeof value === 'number') return value * scales[scaleKey];
  return value;
}

/**
 * Reads property sets per element. Type-level sets are applied first and
 * occurrence-level sets override them, following IFC's type/occurrence semantics.
 * Quantity sets (IfcElementQuantity) are intentionally not read.
 */
export function collectProperties(
  api: IfcAPI,
  modelID: number,
  typeOf: ReadonlyMap<number, number>,
  scales: UnitScales,
): Map<number, Properties> {
  const psetCache = new Map<number, Properties>();
  const readPset = (psetId: number): Properties => {
    let cached = psetCache.get(psetId);
    if (cached) return cached;
    cached = {};
    const pset = api.GetLine(modelID, psetId);
    if (pset?.type === IFCPROPERTYSET) {
      const psetName = String(plain(pset.Name) ?? 'Unnamed');
      for (const propId of refIds(pset.HasProperties)) {
        const prop = api.GetLine(modelID, propId);
        const propName = plain(prop?.Name);
        if (propName === null) continue;
        let value: PropertyValue | null = null;
        if (prop.type === IFCPROPERTYSINGLEVALUE) value = toPropertyValue(prop.NominalValue, scales);
        if (prop.type === IFCPROPERTYENUMERATEDVALUE) {
          const values = (prop.EnumerationValues ?? []).map((v: unknown) => toPropertyValue(v, scales));
          value = values.filter((v: PropertyValue | null) => v !== null).join(',') || null;
        }
        if (value !== null) cached[`${psetName}.${propName}`] = value;
      }
    }
    psetCache.set(psetId, cached);
    return cached;
  };

  const occurrence = new Map<number, Properties>();
  for (const rel of linesOfType(api, modelID, IFCRELDEFINESBYPROPERTIES)) {
    const psetIds = refIds(rel.RelatingPropertyDefinition);
    for (const elementId of refIds(rel.RelatedObjects)) {
      const props = occurrence.get(elementId) ?? {};
      for (const psetId of psetIds) Object.assign(props, readPset(psetId));
      occurrence.set(elementId, props);
    }
  }

  const result = new Map<number, Properties>();
  const elementIds = new Set([...occurrence.keys(), ...typeOf.keys()]);
  for (const elementId of elementIds) {
    const typeId = typeOf.get(elementId);
    const typeProps: Properties = {};
    if (typeId !== undefined) {
      for (const psetId of refIds(api.GetLine(modelID, typeId)?.HasPropertySets)) Object.assign(typeProps, readPset(psetId));
    }
    result.set(elementId, { ...typeProps, ...occurrence.get(elementId) });
  }
  return result;
}
