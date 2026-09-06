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
// M2 — this file now also carries the live client-side call
// (requestNotebookPlan/generateNotebookScene), mirroring
// synthesizeTeachingOutput.ts's own split: prompt builders + a fetch-based
// client function in one file, called by both the API route (server) and
// the UI (client) that eventually triggers it. generateNotebookScene
// always builds a scene from scratch from the units/sources it's given —
// it never reads or mutates a note's existing notebookScene itself.
//
// Multi-source synthesis: buildNotebookPlannerUserPrompt now accepts
// optional professorExplanation/studentNotes/supplementalSources/
// existingNotebookSummary/relatedConceptKnowledge — additional context
// alongside the SOURCE THOUGHT UNITS list, not a replacement for it. The
// grounding rule stays anchored to the numbered unit list only: a
// highlight/underline/source_anchor block must still be verbatim from a
// cited unit, never from these supplementary materials — see the system
// prompt's own explicit statement of this below.
//
// M3 — WhiteboardPanel.tsx's handleSaveToNoteLab is the first real caller:
// when a page's lesson was taught, it extracts the lesson's own narration
// (lessonToNotebookScene.ts's extractLessonNarration — the DURABLE
// KNOWLEDGE, not N5's raw shape geometry) as professorExplanation, reads
// the page's existing notebookScene (if any) via summarizeExistingNotebookScene
// as existingNotebookSummary, and calls generateNotebookScene with both —
// so the AI reorganizes the student's cumulative page instead of either
// duplicating the whiteboard canvas (N5's original behavior) or discarding
// what was already composed. lessonToNotebookScene.ts's deterministic
// buildNotebookSceneFromLessonSnapshot function still exists and is still
// used — now as the fallback for when the live AI call fails, not the
// primary path.
//
// M4 — relatedConceptKnowledge extends "combine with existing notebook
// knowledge" past a single page: lib/notelab/conceptAccumulation.ts's
// gatherConceptNotebookContent finds every OTHER note sharing this page's
// UltraNote.knowledgeNodeId (the ALREADY-WIRED Knowledge Graph concept
// identity — resolveOrCreateNode, not invented here) and summarizes what
// each already contains. Note identity itself is untouched: still one
// UltraNote per (bookId, pageNumber); this is purely additional prompt
// context so a textbook page, a lecture slide, and a Professor explanation
// on the SAME concept can genuinely inform each other's synthesis, the
// correction's own worked example.

import { z } from "zod";
import type { CanonicalThoughtUnit } from "@/lib/canonical/types";
import { isGroundedQuote, normalizeForGrounding } from "@/lib/examEngine/questionGrounding";
import {
  NotebookPrimitiveSchema,
  GROUNDING_REQUIRED_PRIMITIVES,
  TeachingStructureSchema,
  RelationshipKindSchema,
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
  /** Meaningful only for arrow/connector blocks — see notebookScene.ts's own
   *  field doc. Null for every other primitive, and null is a legitimate
   *  answer for an arrow/connector too when no specific kind applies. */
  relationshipKind: RelationshipKindSchema.nullable(),
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
- arrow — a directional connector between two blocks (use groupId to link them; set relationshipKind when the connection has a specific kind — causes, leads-to, warns-about, supports, contrasts, part-of)
- connector — a non-directional link/association line between two blocks (same relationshipKind field as arrow)
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
- concept_group — a container that visually gathers several related blocks as one hub (use groupId to gather its members)
- bracket — a brace spanning several blocks to mark them as one set (use groupId)
- handwritten_text — body prose meant to read as the student's own handwriting rather than typed notes; use this instead of plain text when the page calls for a personal, penned-in-the-margin feel

GROUNDING (non-negotiable): for highlight, underline, and source_anchor blocks, \`content\` MUST be copied VERBATIM, character-for-character, from the source thought unit you cite via sourceUnitIndex — never a paraphrase, never a summary, never a corrected/cleaned-up version. A block that fails this check is discarded entirely, so an ungrounded highlight/underline/source_anchor is worse than not including one.

For every other primitive, \`content\` (and \`detail\` where relevant) is your own composed explanation, grounded in meaning by sourceUnitIndex but not required to be a verbatim quote.

MULTI-SOURCE CONTEXT: the user prompt may also include the student's own notes, a Professor's spoken explanation from a taught lesson, supplemental sources the student attached, a summary of this page's own existing notebook, and related notes on this SAME CONCEPT from other pages/sources entirely. Use all of these to inform your composed (non-grounding-required) blocks — they can shape what you emphasize and how you explain it. They are NEVER a valid source for a highlight/underline/source_anchor block's verbatim content — that grounding rule applies ONLY to the numbered SOURCE THOUGHT UNITS list, never to these supplementary materials, however word-for-word they may read. When an EXISTING NOTEBOOK section is present, this is the SAME student's cumulative page, not a blank one: reorganize and extend what's already composed — fold in what the new material adds, drop nothing that's still true, never just restate the same explanation in different words. When RELATED NOTES ON THIS SAME CONCEPT are present, the student has already studied this exact concept from other sources — weave in what's consistent, note what THIS page genuinely adds that those didn't, and never contradict or silently ignore what's already established elsewhere without reason.

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

// M2 — additional material a caller can hand the planner alongside the
// page's own canonical thought units. Every field is optional and purely
// additive: a caller passing none of these gets byte-identical prompt
// output to before this phase (see notebookPlanner.test.ts). None of these
// ever substitute for a real cited unit in a grounding-required block —
// see the system prompt's own MULTI-SOURCE CONTEXT paragraph.
export interface NoteSynthesisSources {
  /** Narration/explanation lines from a completed Professor lesson on this
   *  page, if one exists — the SPOKEN content, not N5's separate
   *  deterministic shape-geometry recomposition. */
  professorExplanation?: string[] | null;
  /** The student's own freeform note text for this page — read-only
   *  context for the planner, never rewritten by it. */
  studentNotes?: string | null;
  /** Supplemental sources the student attached (lecture slides, a second
   *  textbook, ...) — short label + excerpt pairs. */
  supplementalSources?: Array<{ label: string; content: string }> | null;
  /** M3 — a short summary of this page's EXISTING notebookScene, when one
   *  already exists (see summarizeExistingNotebookScene below). Lets the
   *  planner reorganize/extend a page's cumulative notebook rather than
   *  generating a blind duplicate every time it's asked to compose the
   *  same page again — the correction's own "combine with existing
   *  notebook knowledge" step. */
  existingNotebookSummary?: string | null;
  /** M4 — what OTHER notes sharing this page's SAME CONCEPT (see
   *  UltraNote.knowledgeNodeId and lib/notelab/conceptAccumulation.ts's
   *  gatherConceptNotebookContent) already contain, source-labeled by
   *  book/page. The correction's own worked example: a textbook page, a
   *  lecture slide, a Professor explanation, and a student's handwritten
   *  note can all strengthen the SAME "Ionic Bonding" concept — this is
   *  that accumulation surfacing as prompt context, not a note-identity
   *  change (UltraNote's own storage key stays bookId+pageNumber). */
  relatedConceptKnowledge?: string | null;
  /** ND1 (NoteLab Designer Agent) — set only on a corrective retry pass,
   *  after lib/notelab/notebookDesignerAgent.ts's quality diagnostic found
   *  the FIRST attempt too thin/ungrounded/text-heavy. Describes exactly
   *  what was wrong so the model can address it directly, rather than a
   *  blind identical retry. Never set on a first attempt. */
  correctionFeedback?: string | null;
}

/** Turns an already-composed VisualNotebookScene into the short text
 *  summary buildNotebookPlannerUserPrompt's EXISTING NOTEBOOK CONTENT
 *  section expects — one line per block, primitive-tagged so the model can
 *  see what visual form each piece already took, not just its words. */
export function summarizeExistingNotebookScene(scene: VisualNotebookScene): string {
  return scene.blocks
    .filter((b) => b.content.trim())
    .map((b) => `[${b.primitive}] ${b.content}${b.detail ? ` — ${b.detail}` : ""}`)
    .join("\n");
}

export function buildNotebookPlannerUserPrompt(
  units: CanonicalThoughtUnit[],
  opts: { bookTitle?: string; pageNumber: number } & NoteSynthesisSources,
): string {
  const header = [
    opts.bookTitle ? `Book: ${opts.bookTitle}` : null,
    `Page: ${opts.pageNumber}`,
  ].filter(Boolean).join("\n");

  const unitList = units.map((u, i) => summarizeUnitForPrompt(u, i)).join("\n\n");

  const extraSections: string[] = [];
  if (opts.professorExplanation?.length) {
    extraSections.push(`── PROFESSOR'S EXPLANATION (spoken during a taught lesson on this page — context only, never a grounding source) ──\n${opts.professorExplanation.join("\n")}`);
  }
  if (opts.studentNotes?.trim()) {
    extraSections.push(`── STUDENT'S OWN NOTES (context only, never a grounding source) ──\n${opts.studentNotes.trim()}`);
  }
  if (opts.supplementalSources?.length) {
    extraSections.push(`── SUPPLEMENTAL SOURCES (context only, never a grounding source) ──\n${opts.supplementalSources.map((s) => `${s.label}: ${s.content}`).join("\n\n")}`);
  }
  if (opts.existingNotebookSummary?.trim()) {
    extraSections.push(`── THIS PAGE'S EXISTING NOTEBOOK (reorganize/extend intelligently — do not just repeat it) ──\n${opts.existingNotebookSummary.trim()}`);
  }
  if (opts.relatedConceptKnowledge?.trim()) {
    extraSections.push(`── RELATED NOTES ON THIS SAME CONCEPT, FROM OTHER PAGES/SOURCES (context only, never a grounding source) ──\n${opts.relatedConceptKnowledge.trim()}`);
  }
  // ND1 — placed LAST and phrased as a direct correction, not just more
  // background material, so the model treats it as the most actionable
  // instruction in the prompt rather than one more context section to weigh.
  if (opts.correctionFeedback?.trim()) {
    extraSections.push(`── YOUR PREVIOUS ATTEMPT NEEDS CORRECTION ──\n${opts.correctionFeedback.trim()}`);
  }
  const extraBlock = extraSections.length ? `\n\n${extraSections.join("\n\n")}` : "";

  return `${header}

── SOURCE THOUGHT UNITS (cite by index via sourceUnitIndex) ──
${unitList || "(no thought units extracted for this page yet)"}${extraBlock}

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
      relationshipKind: block.relationshipKind,
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

// ── M2 — the live call ──────────────────────────────────────────────────────
// Follows synthesizeTeachingOutput.ts's own client-function pattern exactly:
// POST to a Next.js API route that runs the actual OpenAI call server-side
// (never exposing OPENAI_API_KEY to the client), parse+validate the JSON
// response against the same Zod schema the route itself validates against
// before responding — never trust the network round-trip alone.

export interface RequestNotebookPlanOpts extends NoteSynthesisSources {
  bookTitle?: string;
  pageNumber: number;
  styleProfile?: NotebookStyleProfile | null;
}

export async function requestNotebookPlan(
  units: CanonicalThoughtUnit[],
  opts: RequestNotebookPlanOpts,
  signal?: AbortSignal,
): Promise<NotebookPlan> {
  const response = await fetch("/api/notebook-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ units, ...opts }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error ?? `notebook plan request failed: ${response.status}`);
  }

  const raw = await response.json();
  return NotebookPlanSchema.parse(raw);
}

/** The one function a save flow actually calls: request the plan, then
 *  deterministically finalize it into a real scene — units passed to both
 *  calls must be the SAME array, since finalizeNotebookScene resolves the
 *  plan's sourceUnitIndex citations against it. Always builds a scene from
 *  scratch; merging with a note's EXISTING notebookScene (rather than
 *  overwriting it) is the caller's job — see this file's header comment. */
export async function generateNotebookScene(
  units: CanonicalThoughtUnit[],
  opts: RequestNotebookPlanOpts & { bookId: string },
  signal?: AbortSignal,
): Promise<VisualNotebookScene> {
  const plan = await requestNotebookPlan(units, opts, signal);
  return finalizeNotebookScene(plan, units, opts);
}
