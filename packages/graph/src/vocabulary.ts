import type { CypherRunner } from './client.ts';

export interface Vocabulary {
  /** IFC classes present in the graph, including ancestors usable in selectors. */
  readonly classes: readonly string[];
  /** Property-set keys ("<Pset>.<Property>") present on elements. */
  readonly propertyKeys: readonly string[];
  /** Value type observed for each property key; "mixed" when elements disagree. */
  readonly propertyTypes: Readonly<Record<string, PropertyType>>;
}

export type PropertyType = 'string' | 'number' | 'boolean' | 'mixed';

function toPropertyType(valueTypes: readonly string[]): PropertyType {
  const kinds = new Set(valueTypes.map((t) => {
    if (t.startsWith('STRING')) return 'string';
    if (t.startsWith('INTEGER') || t.startsWith('FLOAT')) return 'number';
    if (t.startsWith('BOOLEAN')) return 'boolean';
    return 'mixed';
  }));
  return kinds.size === 1 ? [...kinds][0]! as PropertyType : 'mixed';
}

/** What rule authors can refer to: the classes and properties that actually occur in the federated model. */
export async function loadVocabulary(runner: CypherRunner): Promise<Vocabulary> {
  const [classes] = await runner.run(
    `MATCH (e:Element)
     WITH collect(DISTINCT e.ifcClass) + reduce(acc = [], s IN collect(DISTINCT e.ifcSuperClasses) + collect(DISTINCT coalesce(e.ifcDerivedClasses, [])) | acc + s) AS all
     UNWIND all AS c
     WITH DISTINCT c ORDER BY c
     RETURN collect(c) AS classes`,
  );
  const keyRows = await runner.run(
    `MATCH (e:Element)
     UNWIND keys(e) AS k
     WITH k, e[k] AS v WHERE k CONTAINS '.'
     RETURN k AS key, collect(DISTINCT valueType(v)) AS types
     ORDER BY key`,
  );
  return {
    classes: (classes?.classes as string[]) ?? [],
    propertyKeys: keyRows.map((row) => String(row.key)),
    propertyTypes: Object.fromEntries(keyRows.map((row) => [String(row.key), toPropertyType(row.types as string[])])),
  };
}
