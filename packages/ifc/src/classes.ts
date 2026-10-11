import { InheritanceDef, SchemaNames, IFCPRODUCT, type IfcAPI } from 'web-ifc';

export interface ClassResolver {
  nameOf(typeCode: number): string;
  /** Ancestors below IfcProduct, nearest first (e.g. IfcWall, IfcBuiltElement, IfcElement). */
  superClassesOf(typeCode: number): string[];
  isSubtypeOf(typeCode: number, ancestorCode: number): boolean;
}

/** Builds class-hierarchy lookups from web-ifc's generated schema metadata. */
export function createClassResolver(api: IfcAPI, schemaName: string): ClassResolver {
  const schemaIndex = SchemaNames.findIndex((names) => names?.includes(schemaName));
  const inheritance: Record<number, number[]> | undefined = InheritanceDef[schemaIndex];
  if (!inheritance) throw new Error(`Unsupported IFC schema: ${schemaName}`);

  const descendants = (code: number): number[] => inheritance[code] ?? [];
  const products = new Set(descendants(IFCPRODUCT));
  const ancestors = new Map<number, number[]>();
  for (const [superCode, subCodes] of Object.entries(inheritance)) {
    for (const sub of subCodes) {
      const list = ancestors.get(sub) ?? [];
      list.push(Number(superCode));
      ancestors.set(sub, list);
    }
  }

  return {
    nameOf: (code) => api.GetNameFromTypeCode(code),
    superClassesOf: (code) =>
      (ancestors.get(code) ?? [])
        .filter((ancestor) => products.has(ancestor))
        // a nearer ancestor has fewer descendants than a farther one
        .sort((a, b) => descendants(a).length - descendants(b).length)
        .map((ancestor) => api.GetNameFromTypeCode(ancestor)),
    isSubtypeOf: (code, ancestorCode) => descendants(ancestorCode).includes(code),
  };
}
