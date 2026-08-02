// lib/insights/pageAnnotationPlan.ts
// Surgeon annotation plan — the structured output from the annotation-planner
// API pass. Every annotation structure must reference canonical unit IDs that
// are grounded on the *current* page. Synthetic interpretation lives in the
// right panel; false highlights must never appear in the PDF.

import { z } from "zod";

// ── Display styles ────────────────────────────────────────────────────────────
// Each style corresponds to a distinct visual treatment in the PDF overlay:
//   gold-rule       — horizontal rule above a definition block
//   brace           — left brace spanning a multi-step mechanism chain
//   numbered-rail   — numbered steps along a procedure sequence
//   decision-marker — diamond / fork marker at a decision point
//   danger-notch    — red notch / left-border on a trap or warning
//   pearl-marker    — compact green dot on a clinical pearl
//   connector       — line / arrow connecting compared items
//   underline       — restrained underline for evidence citations

export const AnnotationDisplaySchema = z.enum([
  "gold-rule",
  "brace",
  "numbered-rail",
  "decision-marker",
  "danger-notch",
  "pearl-marker",
  "connector",
  "underline",
]);

export type AnnotationDisplay = z.infer<typeof AnnotationDisplaySchema>;

// ── Structure types ───────────────────────────────────────────────────────────

export const AnnotationStructureTypeSchema = z.enum([
  "definition",
  "mechanism",
  "procedure",
  "decision",
  "trap",
  "pearl",
  "comparison",
  "evidence",
]);

export type AnnotationStructureType = z.infer<typeof AnnotationStructureTypeSchema>;

// ── Default display for each structure type ───────────────────────────────────
// Used client-side when the planner omits the display field.

export const DEFAULT_DISPLAY: Record<AnnotationStructureType, AnnotationDisplay> = {
  definition: "gold-rule",
  mechanism:  "brace",
  procedure:  "numbered-rail",
  decision:   "decision-marker",
  trap:       "danger-notch",
  pearl:      "pearl-marker",
  comparison: "connector",
  evidence:   "underline",
};

// ── Annotation structure ──────────────────────────────────────────────────────

export const AnnotationStructureSchema = z.object({
  /** Stable ID for deduplication and layer keying. */
  id: z.string().min(1),
  /** Semantic type of this structure. */
  type: AnnotationStructureTypeSchema,
  /**
   * IDs of the canonical units from the current page that ground this
   * annotation. Must reference units from the *current* page only —
   * the planner API enforces this; the Zod schema validates it client-side
   * by checking that every id appears in the page's canonical unit list.
   */
  canonicalUnitIds: z.array(z.string().min(1)).min(1),
  /** Short human-readable label shown in the margin / tooltip. */
  label: z.string().min(1).max(120),
  /** One-sentence rationale for why these units form this structure. */
  rationale: z.string().min(1).max(400),
  /** Visual treatment to apply in the PDF overlay. */
  display: AnnotationDisplaySchema,
});

export type AnnotationStructure = z.infer<typeof AnnotationStructureSchema>;

// ── Full page annotation plan ─────────────────────────────────────────────────

export const PageAnnotationPlanSchema = z.object({
  /**
   * pageTruthKey at the time the plan was generated.
   * Format: "<documentId>::<pageNumber>::t"
   * Plans must be discarded when this key no longer matches the current page.
   */
  pageTruthKey: z.string().min(1),
  /**
   * One-sentence thesis for the current page — used as the whiteboard title
   * and canonical Chief Resident context anchor.
   */
  pageThesis: z.string().min(1).max(200),
  /** Ordered list of annotation structures derived from the current page. */
  structures: z.array(AnnotationStructureSchema),
});

export type PageAnnotationPlan = z.infer<typeof PageAnnotationPlanSchema>;

// ── Validation helper ─────────────────────────────────────────────────────────

/**
 * Validate a plan and assert that every canonicalUnitId references a known
 * unit from the current page. Returns the validated plan or throws.
 */
export function validateAnnotationPlan(
  raw: unknown,
  knownUnitIds: Set<string>,
): PageAnnotationPlan {
  const plan = PageAnnotationPlanSchema.parse(raw);

  for (const structure of plan.structures) {
    for (const id of structure.canonicalUnitIds) {
      if (!knownUnitIds.has(id)) {
        throw new Error(
          `Annotation structure "${structure.id}" references unknown unit id "${id}" — ` +
          `annotations must only reference canonical units from the current page.`,
        );
      }
    }
  }

  return plan;
}
