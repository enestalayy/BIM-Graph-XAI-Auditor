import type { IfcAPI } from 'web-ifc';

/** Express id of a STEP reference attribute ({ type: 5, value: id }). */
export function refId(attribute: unknown): number | undefined {
  if (attribute && typeof attribute === 'object' && 'value' in attribute && typeof attribute.value === 'number') {
    return attribute.value;
  }
  return undefined;
}

/** Express ids of a reference-or-list attribute, ignoring anything that is not a reference. */
export function refIds(attribute: unknown): number[] {
  const items = Array.isArray(attribute) ? attribute : [attribute];
  return items.map(refId).filter((id): id is number => id !== undefined);
}

/** Primitive value of a wrapped STEP attribute ({ value: x }), or null. */
export function plain(attribute: unknown): string | number | boolean | null {
  if (attribute && typeof attribute === 'object' && 'value' in attribute) {
    const value = attribute.value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  }
  return null;
}

/** Iterates all lines of the given entity type (exact type, no subtypes). */
export function* linesOfType(api: IfcAPI, modelID: number, type: number): Generator<any> {
  for (const id of api.GetLineIDsWithType(modelID, type)) {
    yield api.GetLine(modelID, id);
  }
}
