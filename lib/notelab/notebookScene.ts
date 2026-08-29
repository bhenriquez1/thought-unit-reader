// lib/notelab/notebookScene.ts
// N2 — the shared visual vocabulary for NoteLab's adaptive notebook.
//
// This is NOT a new, parallel "card type" system. NoteLab's fixed dashboard
// sections (Chief Concern, Danger Zone, Clinical Pearl, ...) were retired in
// N1 precisely because a fixed set of labeled slots recreates the same
// "predefined container the knowledge must fit inside" problem no matter
// what the labels say. VisualNotebookScene replaces that with a page
// composed from real VISUAL PRIMITIVES — the same building blocks a student
// authoring their own notebook by hand would reach for — chosen per page by
// the NotebookPlanner (lib/notelab/notebookPlanner.ts), never forced.
//
// Reuses existing infrastructure rather than inventing a competing one:
//   - TeachingStructure (lib/whiteboard/professorLessonPlan.ts) is REUSED
//     as this scene's own page-level classification — the same "what kind
//     of teaching structure is this page" judgment Professor Whiteboard
//     already makes, not a second parallel taxonomy.
//   - VisualSceneGraph (lib/whiteboard/visualSceneGraph.ts) already solves
//     "AI decides content/relationships, deterministic layout decides pixel
//     positions" for Professor's ephemeral teaching canvas — but its VSGNode
//     has no notion of VISUAL FORM per node (every node is the same kind of
//     positioned box; `drawType` picks ONE layout algorithm for the whole
//     scene, not a primitive per node). That per-block primitive vocabulary
//     is the genuinely missing piece this file adds — everything else
//     (grounding discipline, provenance-carries-through, AI-proposes/
//     deterministic-code-resolves) follows the same pattern already proven
//     for Surgeon highlights and Professor Whiteboard.
//
// Pixel/canvas layout is deliberately OUT of scope here (that's N3's tldraw
// renderer, mirroring how buildVSG's layoutAdapters.ts is a separate stage
// from VSGNode's own content model). A NotebookBlock carries only the loose
// ordering/grouping a renderer needs to compose a page that looks authored,
// not gridded — never a literal x/y.

import { z } from "zod";
import { TeachingStructureSchema } from "@/lib/whiteboard/professorLessonPlan";

export { TeachingStructureSchema };
export type { TeachingStructure } from "@/lib/whiteboard/professorLessonPlan";

// ── NotebookPrimitive — the actual visual vocabulary ────────────────────────
// Every value here is a real, distinct visual FORM a block can take — never
// a synonym for "content forced into this slot regardless of relevance."
// A sparse page might use 2-3 of these; a dense one might use most of them.
// None is required; the planner includes a primitive only when the source
// material actually calls for it (see notebookPlanner.ts's prompt).
export const NotebookPrimitiveSchema = z.enum([
  "text",          // a plain explanatory paragraph
  "heading",       // a short section/concept title
  "freehand",      // a hand-drawn sketch or annotation stroke
  "highlight",      // a highlighted span of source text
  "underline",      // an underlined span of source text
  "arrow",          // a directional connector between two blocks
  "connector",      // a non-directional link/association line between two blocks
  "formula",        // a mathematical/chemical equation or expression
  "equation_work",  // a worked derivation/transformation of a formula, step by step
  "diagram",        // a labeled structural/spatial drawing (anatomy, apparatus, circuit, ...)
  "label",          // a short annotation attached to a diagram/image element
  "table",          // tabular data (rows/columns)
  "timeline",       // an ordered sequence of dated/staged events
  "flow",           // a sequential process/procedure chain
  "comparison",      // a side-by-side contrast of two or more things
  "concept_map",     // a hub-and-spoke or network map of related concepts
  "image",          // a reference to a source figure/photo/scan
  "callout",        // a boxed aside — a warning, exception, or high-yield note
  "example",        // a worked or illustrative example
  "source_anchor",   // a verbatim quoted span, grounding the page back to its source
]);
export type NotebookPrimitive = z.infer<typeof NotebookPrimitiveSchema>;

// Primitives whose `content` MUST be a verbatim, grounding-checked substring
// of the source thought unit(s) it cites — never a paraphrase. Mirrors the
// Surgeon Annotation pipeline's exactQuote-only contract and the exam
// engine's isGroundedQuote gate (lib/examEngine/questionGrounding.ts),
// reused (not reimplemented) in notebookPlanner.ts's finalizeNotebookScene.
export const GROUNDING_REQUIRED_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set([
  "highlight", "underline", "source_anchor",
]);

// ── NotebookBlock — one visual primitive on the page ────────────────────────

export const NotebookBlockSchema = z.object({
  id: z.string(),
  primitive: NotebookPrimitiveSchema,
  /** Primary text — verbatim for grounding-required primitives (see above),
   *  AI-composed for explanatory ones (text/heading/label/callout/example). */
  content: z.string(),
  /** Secondary content some primitives need beyond `content` — an
   *  equation_work's step list, a table's serialized rows, a timeline's
   *  ordered event list, a comparison's two-sided breakdown. Free-form
   *  text; N3's renderer owns parsing it per-primitive. Null when the
   *  primitive doesn't need it (e.g. a plain highlight). */
  detail: z.string().nullable(),
  /** Blocks sharing a groupId compose ONE visual unit at render time — e.g.
   *  a diagram's several label/arrow blocks, or a flow's several ordered
   *  steps. Null for a standalone block. */
  groupId: z.string().nullable(),
  /** Loose reading/composition order within its group (or the page, when
   *  groupId is null) — NOT a pixel position. */
  order: z.number(),
  /** Index into the NotebookPlanner's input CanonicalThoughtUnit[] this
   *  block is grounded in. -1 when a block is genuinely page-level and not
   *  attributable to one specific unit (e.g. a page-spanning heading). */
  sourceUnitIndex: z.number(),
});
export type NotebookBlock = z.infer<typeof NotebookBlockSchema>;

// ── NotebookBlock, finalized — provenance attached after AI output resolves
// against the real input array (see notebookPlanner.ts). The AI never
// invents these fields; deterministic code fills them in, same split
// Surgeon/Professor already use for coordinates. ─────────────────────────────

export const FinalizedNotebookBlockSchema = NotebookBlockSchema.extend({
  /** Real CanonicalThoughtUnit.id, resolved from sourceUnitIndex. Null when
   *  sourceUnitIndex didn't resolve to a real input unit. */
  canonicalUnitId: z.string().nullable(),
  /** documentId of the grounding unit, for provenance actions (View Source,
   *  Jump to Reader) — see the correction's canonicalUnitId/sourceId/page/
   *  confidence/generatedFrom provenance contract. */
  sourceId: z.string().nullable(),
  page: z.number().nullable(),
  /** 0-1. 1 for a verified verbatim grounding-required primitive; a fixed,
   *  lower constant for AI-composed explanatory primitives (see
   *  notebookPlanner.ts) — never a model self-report. */
  confidence: z.number().min(0).max(1),
  generatedFrom: z.enum(["ai", "derived", "student"]),
});
export type FinalizedNotebookBlock = z.infer<typeof FinalizedNotebookBlockSchema>;

// ── VisualNotebookScene — one page's composed notebook ──────────────────────

export const VisualNotebookSceneSchema = z.object({
  id: z.string(),
  bookId: z.string(),
  pageNumber: z.number(),
  /** Reuses Professor Whiteboard's own page classification — see this
   *  file's header comment. Not required: a page can legitimately mix
   *  structures, or the classifier can decline to pick one. */
  teachingStructure: TeachingStructureSchema.nullable(),
  blocks: z.array(FinalizedNotebookBlockSchema),
  builtAt: z.number(),
});
export type VisualNotebookScene = z.infer<typeof VisualNotebookSceneSchema>;
