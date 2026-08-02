// lib/insights/pageAnnotationPlan.ts
// SurgeonAnnotationPlan — the structured output of the per-page annotation-planning
// pass. OpenAI reads the current page fresh (text + image) and proposes meaning:
// what deserves annotation, why, and how important it is. It does NOT propose
// coordinates and its quotes are not trusted as-is — every exactQuote is verified
// against the live PDF text layer (lib/highlights/groundSurgeonQuotes.ts) before
// anything is drawn. A quote that doesn't match the page is dropped, never guessed.

import { z } from "zod";

// ── Canonical annotation type ─────────────────────────────────────────────────

export const CanonicalTypeSchema = z.enum([
  "definition",
  "mechanism",
  "procedure",
  "decision",
  "comparison",
  "trap",
  "clinicalPearl",
  "supportingEvidence",
]);

export type CanonicalType = z.infer<typeof CanonicalTypeSchema>;

// ── Visual treatment ───────────────────────────────────────────────────────────
// Each treatment corresponds to a distinct visual drawn by PdfEvidenceOverlay:
//   definitionBar      — left-edge accent bar on a definition span
//   mechanismBrace      — left brace spanning a multi-step mechanism chain
//   procedureRail       — numbered steps along a procedure sequence
//   decisionConnector    — diamond/fork marker at a decision point
//   comparisonBracket    — connector between compared items
//   trapNotch           — corner notch on a trap/warning
//   pearlMarker          — compact marker on a clinical pearl
//   evidenceUnderline    — restrained underline for supporting evidence

export const TreatmentSchema = z.enum([
  "definitionBar",
  "mechanismBrace",
  "procedureRail",
  "decisionConnector",
  "comparisonBracket",
  "trapNotch",
  "pearlMarker",
  "evidenceUnderline",
]);

export type Treatment = z.infer<typeof TreatmentSchema>;

// ── Default treatment for each canonical type ─────────────────────────────────
// Used to backfill `treatment` client- or server-side when the planner omits it —
// the mapping is deterministic, so it never needs to be re-guessed by the model.

export const DEFAULT_TREATMENT: Record<CanonicalType, Treatment> = {
  definition:         "definitionBar",
  mechanism:          "mechanismBrace",
  procedure:          "procedureRail",
  decision:           "decisionConnector",
  comparison:         "comparisonBracket",
  trap:               "trapNotch",
  clinicalPearl:      "pearlMarker",
  supportingEvidence: "evidenceUnderline",
};

// ── Importance ─────────────────────────────────────────────────────────────────

export const ImportanceSchema = z.enum(["critical", "high", "supporting"]);
export type Importance = z.infer<typeof ImportanceSchema>;

// ── Single annotation ───────────────────────────────────────────────────────────

export const SurgeonAnnotationSchema = z.object({
  canonicalType: CanonicalTypeSchema,
  /** Verbatim span from the current page — verified against the PDF text layer
   *  before it is ever drawn. Never trusted as-is. */
  exactQuote:    z.string().min(1).max(600),
  /** One-sentence rationale for why this span deserves this annotation. */
  reason:        z.string().min(1).max(300),
  importance:    ImportanceSchema,
  treatment:     TreatmentSchema,
});

export type SurgeonAnnotation = z.infer<typeof SurgeonAnnotationSchema>;

// ── Full page annotation plan ─────────────────────────────────────────────────

export const SurgeonAnnotationPlanSchema = z.object({
  /**
   * pageTruthKey at the time the plan was generated.
   * Format: "<documentId>::<pageNumber>::t"
   * Plans must be discarded when this key no longer matches the current page.
   */
  pageTruthKey: z.string().min(1),
  /** One-sentence thesis for the current page, read fresh — never copied from a
   *  prior summary. */
  pageThesis:   z.string().min(1).max(200),
  /** Ordered list of annotations derived from the current page. */
  annotations:  z.array(SurgeonAnnotationSchema),
});

export type SurgeonAnnotationPlan = z.infer<typeof SurgeonAnnotationPlanSchema>;

// Back-compat alias — the plan is a "page annotation plan"; both names refer to
// the same schema so existing imports of the older name keep working.
export const PageAnnotationPlanSchema = SurgeonAnnotationPlanSchema;
export type PageAnnotationPlan = SurgeonAnnotationPlan;

// ── Parse helper ───────────────────────────────────────────────────────────────
// No canonicalUnitIds cross-check here — grounding now happens against the live
// PDF text layer (lib/highlights/groundSurgeonQuotes.ts), not a pre-existing id
// list, so there is nothing to validate at this layer beyond the schema shape.

export function parseSurgeonAnnotationPlan(raw: unknown): SurgeonAnnotationPlan {
  return SurgeonAnnotationPlanSchema.parse(raw);
}
