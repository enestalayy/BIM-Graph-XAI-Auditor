import { InheritanceDef, SchemaNames, type IfcAPI } from 'web-ifc';

const IFC4_INHERITANCE: Record<number, number[]> | undefined = InheritanceDef[SchemaNames.findIndex((names) => names?.includes('IFC4'))];

/**
 * IFC2x3 models type MEP occurrences generically (IfcFlowSegment) and carry the
 * specific kind on the type object (IfcDuctSegmentType). IFC4 has a dedicated
 * occurrence class for it (IfcDuctSegment). This returns that IFC4 class when it
 * exists and is a subtype of the element's own class in IFC4, otherwise nothing.
 */
export function deriveOccurrenceClasses(api: IfcAPI, occurrenceCode: number, typeCode: number): string[] {
  const typeName = api.GetNameFromTypeCode(typeCode);
  if (!typeName.endsWith('Type') || !IFC4_INHERITANCE) return [];
  const candidate = typeName.slice(0, -'Type'.length);
  const candidateCode = api.GetTypeCodeFromName(candidate.toUpperCase());
  if (candidateCode === occurrenceCode) return [];
  const isSubtype = (IFC4_INHERITANCE[occurrenceCode] ?? []).includes(candidateCode);
  return isSubtype ? [api.GetNameFromTypeCode(candidateCode)] : [];
}
