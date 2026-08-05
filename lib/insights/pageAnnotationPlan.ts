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
//   comparisonBracket    — paired bracket glyphs between compared items
//   trapNotch           — restrained left-bar + corner notch on a trap/warning
//                          (never a full-strength filled box — kept narrow)
//   pearlMarker          — compact marker on a clinical pearl
//   evidenceUnderline    — light dotted/dashed outline for supporting evidence
//                          and examples. Name is legacy (it was originally a
//                          bottom-border underline); the visual is now a dashed
//                          box outline, not literally an underline.

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

// ── Span scope ─────────────────────────────────────────────────────────────────
// Default behavior is to highlight the COMPLETE sentence (or, for a concept
// spanning consecutive sentences, all of them as one continuous span) — never a
// mid-sentence fragment. "entity" is the narrow exception: a single term, drug
// name, anatomical structure, equation, chemical formula, or short definition
// where highlighting just that span (not the whole sentence) is the deliberate,
// correct teaching behavior. groundSurgeonQuotes.ts expands "fullSentence"
// matches to sentence boundaries; "entity" matches are left exactly as quoted.
export const SpanScopeSchema = z.enum(["fullSentence", "entity"]);
export type SpanScope = z.infer<typeof SpanScopeSchema>;

// ── Relationship ─────────────────────────────────────────────────────────────
// Explicit annotation-to-annotation link the model may declare. Not required
// for the PDF overlay — the three treatments that need grouping
// (mechanismBrace/procedureRail/comparisonBracket) already draw correct
// chains from implicit same-treatment + vertical-proximity detection in
// PdfEvidenceOverlay.tsx, so this field is never read there. It IS read by
// the Whiteboard: lib/whiteboard/visualSceneGraph.ts's
// surgeonAnnotationsToCanonicalEntries() resolves targetIndex to the
// surviving target annotation's real VSG node id and wires it into
// lib/whiteboard/canonicalRelationshipGraph.ts's buildRelationshipGraph() as
// an explicit edge — taking priority over that function's own
// canonicalType-based inference, since a model-declared relationship from
// the same page read is stronger evidence than a guess. targetIndex is an
// index into this same plan's annotations[] array — never a resurrected
// canonicalUnitId-style identity; grounding stays 100% exactQuote-based (see
// the note at the bottom of this file).
export const RelationshipSchema = z.object({
  type:        z.enum(["sequence", "cause-effect", "comparison", "supports"]),
  targetIndex: z.number().int().nonnegative(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

// ── Single annotation ───────────────────────────────────────────────────────────

export const SurgeonAnnotationSchema = z.object({
  canonicalType: CanonicalTypeSchema,
  /**
   * Verbatim span from the current page — verified against the PDF text layer
   * before it is ever drawn. Never trusted as-is. For a multi-sentence concept,
   * this should be the FULL verbatim run of sentences as one span (a single
   * continuous highlight), not one of several fragmented annotations for the
   * same idea — max length is generous specifically to allow this.
   */
  exactQuote:    z.string().min(1).max(1400),
  /** One-sentence rationale for why this span deserves this annotation. */
  reason:        z.string().min(1).max(300),
  importance:    ImportanceSchema,
  treatment:     TreatmentSchema,
  /** Defaults to "fullSentence" when omitted — see SpanScopeSchema above. */
  spanScope:     SpanScopeSchema.optional().default("fullSentence"),
  /** Optional explicit link to another annotation in this same plan. */
  relationship:  RelationshipSchema.optional(),
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
  /**
   * The page's TEACHING TYPE — what kind of page this is and therefore how it
   * should be taught, decided BEFORE any annotation is chosen. This is the
   * shared page classifier: the same value drives both this plan's
   * highlighting density/category guidance (rule 9 in the system prompt) AND
   * the Whiteboard's choice of visual teaching grammar
   * (lib/whiteboard/buildProfessorLessonInput.ts passes it straight through
   * as pageTeachingType) — one classification, not two independent guesses.
   * Model-provided, read fresh alongside pageThesis — never derived from
   * which annotations happen to survive verification/density-limiting
   * downstream.
   */
  pageRole:     z.enum([
    "definition", "procedure", "mechanism", "comparison", "example",
    "anatomy", "physiology", "pharmacology", "diagnosis", "histology",
    "classification", "decision-tree", "workflow",
    "mathematical-derivation", "organic-chemistry-reaction",
  ]),
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
