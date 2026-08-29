// lib/notelab/notebookPlanner.ts
// N2 — NotebookPlanner: CanonicalThoughtUnit[] -> VisualNotebookScene.
//
// The AI layer that replaces "which of these fixed cards does this page
// need" with "how should THIS material actually be represented." Modeled on
// lib/insights/synthesizeTeachingOutput.ts's prompt-builder pattern (a Zod
// schema for OpenAI Structured Outputs + buildXSystemPrompt/buildXUserPrompt
// functions), and on the Surgeon Annotation / Professor Whiteboard pipelines'
// "AI proposes meaning, deterministic code resolves provenance" split: the
// model never invents a canonicalUnitId, a confidence score, or a quote it
// can't point back to — finalizeNotebookScene resolves all of that against
// the real input array afterward.
//
// This file is types + prompt + a pure finalizer only — no renderer (N3) and
// no live API route yet (that's whichever phase first needs to actually call
// this end-to-end; wiring a route with nothing to render into it would be
// premature).

import { z } from "zod";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import { isGroundedQuote, normalizeForGrounding } from "@/lib/examEngine/questionGrounding";
import {
  NotebookPrimitiveSchema,
  GROUNDING_REQUIRED_PRIMITIVES,
  TeachingStructureSchema,
  VisualNotebookSceneSchema,
  type VisualNotebookScene,
  type FinalizedNotebookBlock,
} from "@/lib/notelab/notebookScene";
import { describeNotebookStyleProfile, type NotebookStyleProfile } from "@/lib/notelab/notebookStyleProfile";

// ── AI-facing schema ─────────────────────────────────────────────────────────
// Deliberately narrower than FinalizedNotebookBlockSchema: no canonicalUnitId/
// sourceId/page/confidence/generatedFrom — those are resolved deterministically
// in finalizeNotebookScene below, never supplied by the model. OpenAI
// Structured Outputs requires every field present on every object (nullable,
// not optional) — same discipline synthesizeTeachingOutput.ts's schemas use.

export const NotebookPlanBlockSchema = z.object({
  primitive: NotebookPrimitiveSchema,
  content: z.string(),
  detail: z.string().nullable(),
  groupId: z.string().nullable(),
  order: z.number(),
  /** 0-based index into the user prompt's numbered thought-unit list this
   *  block is grounded in. -1 ONLY for a genuine page-level block (e.g. a
   *  page heading that doesn't belong to one specific unit) — never used to
   *  avoid picking a real source. */
  sourceUnitIndex: z.number(),
});
export type NotebookPlanBlock = z.infer<typeof NotebookPlanBlockSchema>;

export const NotebookPlanSchema = z.object({
  teachingStructure: TeachingStructureSchema.nullable(),
  blocks: z.array(NotebookPlanBlockSchema),
});
export type NotebookPlan = z.infer<typeof NotebookPlanSchema>;

// ── Prompts ───────────────────────────────────────────────────────────────

// N6 — styleProfile is always optional and always additive: every existing
// caller (buildNotebookPlannerSystemPrompt()) still gets the identical base
// prompt it always has. It's computed from the student's OWN past notebooks
// (lib/notelab/notebookStyleProfile.ts) and appended as one more paragraph
// the model weighs — never a rule that can relax the grounding contract
// above it in the same prompt.
export function buildNotebookPlannerSystemPrompt(opts?: { styleProfile?: NotebookStyleProfile | null }): string {
  const base = `You are the NotebookPlanner for Avrrio's NoteLab — an adaptive visual notebook, not a card generator.

YOUR ONLY JOB: decide how THIS page's material should be visually represented, using the primitive vocabulary below. You are NOT filling in a fixed set of labeled sections. There is no "Chief Concern" slot, no "Danger Zone" slot, no required count or required set of primitives. A sparse page might use 2-3 blocks. A dense page might use many. Decide based on what the material actually contains — never pad, never force content into a primitive that doesn't fit it, never invent filler to make the page "feel complete."

══ VISUAL PRIMITIVES (use only what the material calls for) ══
- text — a plain explanatory paragraph
- heading — a short section/concept title
- freehand — a hand-drawn sketch or annotation stroke
- highlight — a highlighted span of VERBATIM source text
- underline — an underlined span of VERBATIM source text
- arrow — a directional connector between two blocks (use groupId to link them)
- connector — a non-directional link/association line between two blocks
- formula — a mathematical/chemical equation or expression
- equation_work — a worked derivation/transformation of a formula, step by step (use detail for the steps)
- diagram — a labeled structural/spatial drawing (anatomy, apparatus, circuit, molecule, ...)
- label — a short annotation attached to a diagram/image element (use groupId to attach it)
- table — tabular data (use detail for serialized rows)
- timeline — an ordered sequence of dated/staged events (use detail for the ordered list)
- flow — a sequential process/procedure chain (use detail for the ordered steps)
- comparison — a side-by-side contrast of two or more things (use detail for the two-sided breakdown)
- concept_map — a hub-and-spoke or network map of related concepts
- image — a reference to a source figure/photo/scan
- callout — a boxed aside: a warning, exception, or high-yield note
- example — a worked or illustrative example
- source_anchor — a verbatim quoted span that grounds the page back to its exact source wording

GROUNDING (non-negotiable): for highlight, underline, and source_anchor blocks, \`content\` MUST be copied VERBATIM, character-for-character, from the source thought unit you cite via sourceUnitIndex — never a paraphrase, never a summary, never a corrected/cleaned-up version. A block that fails this check is discarded entirely, so an ungrounded highlight/underline/source_anchor is worse than not including one.

For every other primitive, \`content\` (and \`detail\` where relevant) is your own composed explanation, grounded in meaning by sourceUnitIndex but not required to be a verbatim quote.

══ THE MATERIAL DECIDES THE PAGE — WORKED EXAMPLES ══
- Naming chemical compounds → rules, worked examples, and annotations (text + example + callout for exceptions), not a diagram.
- Atomic orbitals / molecular geometry → diagram + label blocks showing spatial structure, with a short text block for the governing rule.
- Gas laws / physics relationships → formula + equation_work, then example (a worked calculation), then callout for edge cases.
- Stoichiometry → formula + equation_work with the full worked calculation, reaction expressed as its own formula block.
- Anatomy → diagram (the labeled structure) + label blocks for each part + arrow blocks for spatial/functional relationships, with short text annotations.
- Pathology → flow (normal -> mechanism -> abnormal -> manifestation), with callout for a clinical pearl if the source genuinely contains one.
- History → timeline + label/text blocks for people and events + arrow blocks for causal relationships.
- Literature → concept_map for themes/characters/relationships + source_anchor blocks for the quotations that actually support them.
- Mathematics → text (concept) + formula + equation_work (derivation) + example (worked problem).
- A children's book (Elena Mode) → image + a short text/label block for character or vocabulary + one simple relationship block, kept minimal.

These are illustrations of the REASONING, not a menu to pick one from. A page rarely matches one of these exactly — compose from the primitives based on what THIS page's own content actually is.

Return ONLY the JSON matching the required schema. teachingStructure should reflect the page's own content — null is fine when no single structure fits.`;

  if (!opts?.styleProfile) return base;
  return `${base}\n\n${describeNotebookStyleProfile(opts.styleProfile)}`;
}

function summarizeUnitForPrompt(unit: CanonicalThoughtUnit, index: number): string {
  const roleHint = unit.semanticLabel ? ` [${unit.semanticLabel}]` : "";
  return `${index}.${roleHint} ${unit.text}`;
}

export function buildNotebookPlannerUserPrompt(
  units: CanonicalThoughtUnit[],
  opts: { bookTitle?: string; pageNumber: number },
): string {
  const header = [
    opts.bookTitle ? `Book: ${opts.bookTitle}` : null,
    `Page: ${opts.pageNumber}`,
  ].filter(Boolean).join("\n");

  const unitList = units.map((u, i) => summarizeUnitForPrompt(u, i)).join("\n\n");

  return `${header}

── SOURCE THOUGHT UNITS (cite by index via sourceUnitIndex) ──
${unitList || "(no thought units extracted for this page yet)"}

Compose this page's VisualNotebookScene from the primitives that genuinely fit this material. Cite every block's real source unit index. If a block is truly page-level (not attributable to one unit), use sourceUnitIndex: -1 — but prefer citing a real unit whenever one applies.`;
}

// ── finalizeNotebookScene — deterministic provenance resolution ────────────
// AI-composed explanatory primitives get a fixed, conservative confidence —
// never a model self-report (the model isn't asked for one, and wouldn't be
// trusted if it were). Grounding-required primitives are either verified at
// confidence 1, or dropped entirely — never partially trusted.
const COMPOSED_BLOCK_CONFIDENCE = 0.6;

export function finalizeNotebookScene(
  plan: NotebookPlan,
  units: CanonicalThoughtUnit[],
  opts: { bookId: string; pageNumber: number },
): VisualNotebookScene {
  const finalizedBlocks: FinalizedNotebookBlock[] = [];
  let blockOrdinal = 0;

  for (const block of plan.blocks) {
    const unit = block.sourceUnitIndex >= 0 ? units[block.sourceUnitIndex] : undefined;
    const requiresGrounding = GROUNDING_REQUIRED_PRIMITIVES.has(block.primitive);

    if (requiresGrounding) {
      if (!unit) continue; // never guess a grounding-required block's source
      const grounded = isGroundedQuote(block.content, normalizeForGrounding(unit.text));
      if (!grounded) continue; // discarded, not repaired — see prompt's own rule
    }

    finalizedBlocks.push({
      id: `nb-${opts.bookId}-p${opts.pageNumber}-${blockOrdinal++}`,
      primitive: block.primitive,
      content: block.content,
      detail: block.detail,
      groupId: block.groupId,
      order: block.order,
      sourceUnitIndex: block.sourceUnitIndex,
      canonicalUnitId: unit?.id ?? null,
      sourceId: unit?.documentId ?? null,
      page: unit?.pageIndex ?? opts.pageNumber,
      confidence: requiresGrounding ? 1 : COMPOSED_BLOCK_CONFIDENCE,
      generatedFrom: "ai",
    });
  }

  return VisualNotebookSceneSchema.parse({
    id: `nbscene-${opts.bookId}-p${opts.pageNumber}-${Date.now()}`,
    bookId: opts.bookId,
    pageNumber: opts.pageNumber,
    teachingStructure: plan.teachingStructure,
    blocks: finalizedBlocks,
    builtAt: Date.now(),
  });
}
