import { readFile, rename, writeFile } from 'node:fs/promises';
import { parseRuleSet, type RuleSet } from '@bim/core';

export interface RuleRepository {
  load(): Promise<RuleSet>;
  /** Validates and persists the given (possibly un-defaulted) rule set; returns the stored version. */
  save(input: unknown): Promise<RuleSet>;
}

/** Rule set stored as a JSON file, written atomically (temp file + rename). */
export function createFileRuleRepository(path: string): RuleRepository {
  return {
    async load() {
      let raw: string;
      try {
        raw = await readFile(path, 'utf8');
      } catch (error) {
        throw new Error(`Cannot read rule file ${path}: ${(error as Error).message}`, { cause: error });
      }
      return parseRuleSet(JSON.parse(raw));
    },
    async save(input) {
      const ruleSet = parseRuleSet(input);
      const temp = `${path}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(ruleSet, null, 2)}\n`, 'utf8');
      await rename(temp, path);
      return ruleSet;
    },
  };
}
