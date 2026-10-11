import type { CypherRunner } from './client.ts';

export interface Vocabulary {
  /** IFC classes present in the graph, including ancestors usable in selectors. */
  readonly classes: readonly string[];
  /** Property-set keys ("<Pset>.<Property>") present on elements. */
  readonly propertyKeys: readonly string[];
}

/** What rule authors can refer to: the classes and properties that actually occur in the federated model. */
export async function loadVocabulary(runner: CypherRunner): Promise<Vocabulary> {
  const [classes] = await runner.run(
    `MATCH (e:Element)
     WITH collect(DISTINCT e.ifcClass) + reduce(acc = [], s IN collect(DISTINCT e.ifcSuperClasses) | acc + s) AS all
     UNWIND all AS c
     WITH DISTINCT c ORDER BY c
     RETURN collect(c) AS classes`,
  );
  const [keys] = await runner.run(
    `MATCH (e:Element)
     UNWIND keys(e) AS k
     WITH DISTINCT k WHERE k CONTAINS '.'
     WITH k ORDER BY k
     RETURN collect(k) AS keys`,
  );
  return { classes: (classes?.classes as string[]) ?? [], propertyKeys: (keys?.keys as string[]) ?? [] };
}
