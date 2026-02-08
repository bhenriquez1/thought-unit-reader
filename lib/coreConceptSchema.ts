/**
 * Core Concept Schema (strict Zod validation)
 *
 * Hard limits:
 * - Max 4 concepts per page
 * - Each concept: exactly 1 sentence (max 220 chars)
 * - Sub-paragraph precision: page → paragraphIndex → clauseIndex
 * - No examples, no history, no filler
 */

import { z } from "zod";

export const CoreConceptSourceSchema = z.object({
  page: z.number().int().min(1),
  paragraphIndex: z.number().int().min(0),
  clauseIndex: z.number().int().min(0),
});

export const CoreConceptSchema = z.object({
  id: z.string().min(1),
  checkpointId: z.string().optional().default(""),
  text: z
    .string()
    .min(10)
    .max(220),
  examRelevance: z.number().min(0).max(1),
  source: CoreConceptSourceSchema,
});

export const CoreConceptListSchema = z.object({
  concepts: z.array(CoreConceptSchema).max(4),
});

export type CoreConcept = z.infer<typeof CoreConceptSchema>;
export type CoreConceptSource = z.infer<typeof CoreConceptSourceSchema>;
export type CoreConceptList = z.infer<typeof CoreConceptListSchema>;

/**
 * Validate a raw API response into CoreConceptList.
 * Returns validated data or null + error.
 */
export function validateCoreConcepts(raw: unknown): {
  success: boolean;
  data: CoreConceptList | null;
  error: string | null;
} {
  const result = CoreConceptListSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data, error: null };
  }
  return {
    success: false,
    data: null,
    error: result.error.issues.map((i) => i.message).join("; "),
  };
}
