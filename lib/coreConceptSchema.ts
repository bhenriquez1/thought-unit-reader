/**
 * Core Concept Schema (strict Zod validation)
 *
 * Hard limits:
 * - Max 8 concepts per paragraph window
 * - Max 2 anchors per concept
 * - Max 3 tags per concept
 * - examWeight: 1-5 (coarse)
 * - confidence: 0-3 (no fake decimals)
 * - Lazy-load expansions (procedures/examples) only on card expand
 */

import { z } from "zod";

// ============================================================================
// Anchor (sub-paragraph locator)
// ============================================================================

export const AnchorSchema = z.object({
  quote: z.string().max(140),
  locator: z.object({
    page: z.number().int().positive(),
    windowIndex: z.number().int().min(0),
    charStart: z.number().int().min(0),
    charEnd: z.number().int().min(0),
  }),
});

export type Anchor = z.infer<typeof AnchorSchema>;

// ============================================================================
// Core Concept
// ============================================================================

export const CoreConceptSchema = z.object({
  id: z.string().min(6),
  label: z.string().min(3).max(64),
  oneLiner: z.string().min(8).max(220),
  anchors: z.array(AnchorSchema).max(2),
  tags: z
    .array(z.enum(["definition", "process", "rule", "example", "pitfall"]))
    .max(3),
  examWeight: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  confidence: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
  ]),
});

export type CoreConcept = z.infer<typeof CoreConceptSchema>;

// ============================================================================
// Extract request / response
// ============================================================================

export const CoreExtractResponseSchema = z.object({
  meta: z.object({
    docId: z.string(),
    page: z.number().int().positive(),
    windowIndex: z.number().int().min(0),
    mode: z.enum(["page_window", "chapter_scan"]),
    textHash: z.string(),
    ms: z.number().int().min(0),
  }),
  concepts: z.array(CoreConceptSchema).max(8),
  errors: z
    .array(z.object({ code: z.string(), message: z.string() }))
    .optional(),
});

export type CoreExtractRequest = {
  docId: string;
  chapterId?: string;
  page: number;
  windowIndex: number;
  windowText: string;
  context?: { title?: string; sectionHint?: string };
  mode: "page_window" | "chapter_scan";
};

export type CoreExtractResponse = z.infer<typeof CoreExtractResponseSchema>;

// ============================================================================
// Expand request / response (lazy-load)
// ============================================================================

export type CoreExpandRequest = {
  docId: string;
  conceptId: string;
  conceptLabel: string;
  windowText: string;
};

export type CoreExpandResponse = {
  conceptId: string;
  expansions: {
    procedure?: string[]; // MAX 3 bullets
    examples?: string[];  // MAX 2
    pitfalls?: string[];  // MAX 2
  };
  flashcards: { q: string; a: string }[]; // MAX 2
};

// ============================================================================
// Validation helpers
// ============================================================================

export function validateCoreExtractResponse(raw: unknown): {
  success: boolean;
  data: CoreExtractResponse | null;
  error: string | null;
} {
  const result = CoreExtractResponseSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data, error: null };
  }
  return {
    success: false,
    data: null,
    error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  };
}
