import { z } from 'zod';

/**
 * Expert-labelled expected findings for one dataset. Each entry names the rule
 * and the element GlobalIds; it maps to the deterministic violation id.
 */
export const goldStandardSchema = z
  .object({
    dataset: z.string().min(1),
    annotator: z.string().min(1),
    createdAt: z.string().min(1),
    models: z.array(z.string().min(1)).min(1),
    /** Rule set the labels refer to (path or version note). */
    ruleSet: z.string().min(1),
    expected: z.array(
      z
        .object({
          ruleId: z.string().min(1),
          elements: z.array(z.string().min(1)).min(1).max(2),
          note: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type GoldStandard = z.infer<typeof goldStandardSchema>;

/** Same id scheme as the rule engine: "ruleId:guid" or "ruleId:guidA:guidB" with the pair sorted. */
export function expectedViolationIds(gold: GoldStandard): string[] {
  return gold.expected.map((e) => `${e.ruleId}:${[...e.elements].sort().join(':')}`);
}
