// lib/whiteboard/visualSceneGraph.ts
// Validated VisualSceneGraph schema — the canonical data contract for the
// Whiteboard engine.
//
// Pipeline:
//   CanonicalEntryInput[] + WhiteboardGrammar
//       → buildRelationshipGraph()          (infer edges, rank nodes)
//       → assignRoles()                     (hub/spoke/step/left/right/…)
//       → layout adapter                    (pixel positions, 460-wide SVG space)
//       → VisualSceneGraphSchema.parse()    (Zod validation — throws on bad data)
//       → VisualSceneGraph                  (typed, validated, ready to render)
//
// Phase 1 deliverable: schema + factory.
// Phase 2 will wire TldrawCanvas and VisualSceneEngine to consume VSGNode[]
// instead of NoteCard[].

import { z } from "zod";
import {
  buildRelationshipGraph,
  type CanonicalEntryInput,
  type RelationshipGraph,
} from "./canonicalRelationshipGraph";
import {
  flowLayout, timelineLayout, hubSpokeLayout, comparisonLayout, equationLayout,
  canvasHeight, CANVAS_W,
  type LayoutInput,
} from "./layoutAdapters";
import { buildSurgeonEvidenceId, type GroundedSurgeonAnnotation } from "@/lib/highlights/groundSurgeonQuotes";
import type { CanonicalType, Importance } from "@/lib/insights/pageAnnotationPlan";

// ── Grammar schema ─────────────────────────────────────────────────────────────

export const WhiteboardGrammarSchema = z.enum([
  "flow", "anatomy", "pathway", "worked-solution", "timeline", "system-diagram", "case-map",
]);
export type WhiteboardGrammar = z.infer<typeof WhiteboardGrammarSchema>;

// ── DrawType — the micro-level layout hint ────────────────────────────────────

export const DrawTypeSchema = z.enum([
  "flow", "anatomy", "comparison", "table", "graph", "equation", "timeline", "cycle",
]);
export type DrawType = z.infer<typeof DrawTypeSchema>;

// ── Importance and tier ───────────────────────────────────────────────────────

export const ImportanceLevelSchema = z.enum(["critical", "high", "medium", "reference"]);
export type ImportanceLevel = z.infer<typeof ImportanceLevelSchema>;

// 5-tier Avrrio color language: master=gold, step=green, decision=blue, danger=red, pearl=cyan
export const AnnotationTierSchema = z.enum(["master", "step", "decision", "danger", "pearl"]);
export type AnnotationTier = z.infer<typeof AnnotationTierSchema>;

// ── Node role ─────────────────────────────────────────────────────────────────

export const NodeRoleSchema = z.enum([
  "hub",     // centre of a hub-spoke layout
  "spoke",   // radial node in hub-spoke layout
  "step",    // node in a sequential flow layout
  "left",    // left column of a comparison layout
  "right",   // right column of a comparison layout
  "term",    // formula term (equation layout)
  "value",   // formula value / result (equation layout)
  "generic", // fallback role
]);
export type NodeRole = z.infer<typeof NodeRoleSchema>;

// ── VSGNode ───────────────────────────────────────────────────────────────────

export const VSGNodeSchema = z.object({
  id:              z.string(),
  label:           z.string(),           // short display label (title or truncated text)
  body:            z.string(),           // full source text
  canonicalType:   z.string().nullable(), // CanonicalSemanticType or null
  importanceLevel: ImportanceLevelSchema,
  tier:            AnnotationTierSchema,  // 5-tier color channel
  role:            NodeRoleSchema,        // layout role in this grammar
  position:        z.object({ x: z.number(), y: z.number() }), // SVG-space pixels
  size:            z.object({ w: z.number(), h: z.number() }),
  page:            z.number().optional(),
  sourceId:        z.string(),            // original CanonicalEntryInput.id for One Brain sync
});
export type VSGNode = z.infer<typeof VSGNodeSchema>;

// ── VSGEdge ───────────────────────────────────────────────────────────────────

export const EdgeKindSchema = z.enum([
  "sequence",    // A → B in a linear chain
  "causation",   // A causes / triggers B
  "contrast",    // A vs B
  "elaboration", // A defines / explains B
  "reference",   // weak association
]);
export type EdgeKind = z.infer<typeof EdgeKindSchema>;

export const VSGEdgeSchema = z.object({
  id:     z.string(),
  fromId: z.string(),
  toId:   z.string(),
  label:  z.string().optional(),
  kind:   EdgeKindSchema,
});
export type VSGEdge = z.infer<typeof VSGEdgeSchema>;

// ── VisualSceneGraph ──────────────────────────────────────────────────────────

export const VisualSceneGraphSchema = z.object({
  id:               z.string(),            // deterministic content hash
  grammar:          WhiteboardGrammarSchema,
  drawType:         DrawTypeSchema,         // effective micro-level layout type
  nodes:            z.array(VSGNodeSchema),
  edges:            z.array(VSGEdgeSchema),
  canvas:           z.object({ width: z.number(), height: z.number() }),
  sourcePageNumber: z.number().optional(),
  builtAt:          z.number(),            // Date.now() at build time
});
export type VisualSceneGraph = z.infer<typeof VisualSceneGraphSchema>;

// ── VSGState — for WhiteboardPanel state machine ──────────────────────────────

export type VSGState =
  | { status: "empty"; reason: string }
  | { status: "error"; error: string }
  | { status: "ready"; vsg: VisualSceneGraph };

// ── Internal helpers ──────────────────────────────────────────────────────────

// Grammar → effective DrawType.
// Hub-spoke grammars force "anatomy" draw type.
// Detailed draw type (comparison, equation) from buildRelationshipGraph can
// override within a compatible grammar — see buildVSG logic below.
const GRAMMAR_DRAW_TYPE: Record<string, DrawType> = {
  "flow":            "flow",
  "anatomy":         "anatomy",
  "pathway":         "flow",
  "worked-solution": "equation",
  "timeline":        "timeline",
  "system-diagram":  "anatomy",
  "case-map":        "anatomy",
};

// RelationshipEdgeType → EdgeKind
const EDGE_KIND: Record<string, EdgeKind> = {
  "leads_to":      "causation",
  "defines":       "elaboration",
  "triggers":      "causation",
  "has_exception": "contrast",
  "contrasts":     "contrast",
  "applied_in":    "elaboration",
  "summarizes":    "sequence",
  "supports":      "reference",
  "can_cause":     "causation",
  "classifies":    "elaboration",
  "has_warning":   "contrast",
  "explains":      "elaboration",
};

// ImportanceLevel → AnnotationTier (base mapping; overridden for warning types)
function importanceTier(level: string): AnnotationTier {
  if (level === "critical") return "master";
  if (level === "high")     return "step";
  if (level === "medium")   return "decision";
  return "pearl";
}

// Semantic type → tier override (danger and pearl types always win their channel)
const CANONICAL_TIER_OVERRIDE: Partial<Record<string, AnnotationTier>> = {
  "warning":          "danger",
  "contraindication": "danger",
  "common-error":     "danger",
  "complication":     "danger",
  "memory-anchor":    "pearl",
  "clinical-pearl":   "pearl",
};

function resolveTier(canonicalType: string | null, importanceLevel: string): AnnotationTier {
  if (canonicalType) {
    const override = CANONICAL_TIER_OVERRIDE[canonicalType];
    if (override) return override;
  }
  return importanceTier(importanceLevel);
}

// Assign layout roles based on the effective draw type.
function assignRoles(
  nodes: Array<{ id: string; importanceLevel: string }>,
  effectiveDrawType: DrawType,
): Record<string, NodeRole> {
  const roles: Record<string, NodeRole> = {};

  if (effectiveDrawType === "anatomy" || effectiveDrawType === "graph") {
    // Most-important node (already sorted by buildRelationshipGraph) → hub
    const hubId = nodes[0]?.id;
    for (const n of nodes) {
      roles[n.id] = n.id === hubId ? "hub" : "spoke";
    }
  } else if (effectiveDrawType === "comparison") {
    // First half → left column; second half → right column
    const mid = Math.ceil(nodes.length / 2);
    nodes.forEach((n, i) => { roles[n.id] = i < mid ? "left" : "right"; });
  } else if (effectiveDrawType === "equation") {
    // Alternate term / value
    nodes.forEach((n, i) => { roles[n.id] = i % 2 === 0 ? "term" : "value"; });
  } else {
    // flow / timeline / cycle
    for (const n of nodes) roles[n.id] = "step";
  }

  return roles;
}

// Deterministic content hash (djb2 on grammar + sorted entry IDs).
function buildVSGId(entries: CanonicalEntryInput[], grammar: string): string {
  const input = grammar + ":" + entries.map((e) => e.id).sort().join(",");
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return "vsg_" + (h >>> 0).toString(36);
}

// ── buildVSG ──────────────────────────────────────────────────────────────────

export interface BuildVSGOptions {
  /** Cap on node count passed to buildRelationshipGraph (default 12). */
  maxNodes?:    number;
  /** 1-indexed page number for the sourcePageNumber field. */
  pageNumber?:  number;
}

/**
 * Build and Zod-validate a VisualSceneGraph from canonical thought units.
 *
 * Throws `ZodError` on schema violations — callers should use
 * `computeVSGState` which catches and returns a typed error state instead.
 */
export function buildVSG(
  entries:  CanonicalEntryInput[],
  grammar:  WhiteboardGrammar | string,
  opts:     BuildVSGOptions = {},
): VisualSceneGraph {
  const { maxNodes = 12, pageNumber } = opts;

  // 1. Build relationship graph: sorts by importance, caps nodes, infers edges.
  const rg: RelationshipGraph = buildRelationshipGraph(entries, maxNodes);

  // 2. Validate grammar; fall back to "flow" for unknown values.
  const grammarResult = WhiteboardGrammarSchema.safeParse(grammar);
  const safeGrammar: WhiteboardGrammar = grammarResult.success ? grammarResult.data : "flow";

  // 3. Resolve effective draw type.
  //    Grammar has priority; but "comparison" and "equation" from the graph's
  //    suggestedLayout can override when the grammar is compatible with them.
  const grammarDT: DrawType   = GRAMMAR_DRAW_TYPE[safeGrammar] ?? "flow";
  const suggestedDT            = DrawTypeSchema.safeParse(rg.suggestedLayout);
  const effectiveDrawType: DrawType =
    suggestedDT.success &&
    (suggestedDT.data === "comparison" || suggestedDT.data === "equation") &&
    grammarDT === "flow"
      ? suggestedDT.data
      : grammarDT;

  // 4. Assign layout roles.
  const roleMap = assignRoles(
    rg.nodes.map((n) => ({ id: n.id, importanceLevel: n.importanceLevel })),
    effectiveDrawType,
  );

  // 5. Compute pixel positions.
  const layoutInputs: LayoutInput[] = rg.nodes.map((n) => ({
    id:   n.id,
    role: roleMap[n.id] ?? "generic",
  }));

  let positions: ReturnType<typeof flowLayout>;
  switch (effectiveDrawType) {
    case "anatomy":
    case "graph":
      positions = hubSpokeLayout(layoutInputs);
      break;
    case "comparison":
      positions = comparisonLayout(layoutInputs);
      break;
    case "equation":
      positions = equationLayout(layoutInputs);
      break;
    case "timeline":
      positions = timelineLayout(layoutInputs);
      break;
    default:
      positions = flowLayout(layoutInputs);
  }

  const posMap = new Map(positions.map((p) => [p.id, p]));

  // 6. Build VSGNode[].
  const nodes: VSGNode[] = rg.nodes.map((n) => {
    const pos = posMap.get(n.id) ?? { x: 0, y: 0, w: 290, h: 52 };
    return VSGNodeSchema.parse({
      id:              n.id,
      label:           n.label,
      body:            n.text,
      canonicalType:   n.canonicalType,
      importanceLevel: n.importanceLevel,
      tier:            resolveTier(n.canonicalType, n.importanceLevel),
      role:            roleMap[n.id] ?? "generic",
      position:        { x: pos.x, y: pos.y },
      size:            { w: pos.w, h: pos.h },
      page:            n.page,
      sourceId:        n.id,
    });
  });

  // 7. Build VSGEdge[].
  const edges: VSGEdge[] = rg.edges.map((e, i) => VSGEdgeSchema.parse({
    id:     `e_${i}_${e.from}_${e.to}`,
    fromId: e.from,
    toId:   e.to,
    label:  e.label,
    kind:   EDGE_KIND[e.type] ?? "reference",
  }));

  // 8. Canvas dimensions.
  const canvasH = canvasHeight(positions);

  const vsg = {
    id:               buildVSGId(entries, safeGrammar),
    grammar:          safeGrammar,
    drawType:         effectiveDrawType,
    nodes,
    edges,
    canvas:           { width: CANVAS_W, height: canvasH },
    sourcePageNumber: pageNumber,
    builtAt:          Date.now(),
  };

  // 9. Final top-level Zod validation.
  return VisualSceneGraphSchema.parse(vsg);
}

// ── computeVSGState ────────────────────────────────────────────────────────────

/**
 * Safe wrapper around buildVSG that returns a VSGState instead of throwing.
 * Use this in components — it gives a clean union to render against.
 */
export function computeVSGState(
  entries:  CanonicalEntryInput[],
  grammar:  WhiteboardGrammar | string,
  opts:     BuildVSGOptions = {},
): VSGState {
  if (entries.length === 0) {
    return { status: "empty", reason: "No canonical units available for this page yet." };
  }
  try {
    const vsg = buildVSG(entries, grammar, opts);
    if (vsg.nodes.length === 0) {
      return { status: "empty", reason: "This page has no structured concepts to visualize yet." };
    }
    return { status: "ready", vsg };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "error", error: message };
  }
}

// ── NoteCard adapter ───────────────────────────────────────────────────────────

// NoteCardType → CanonicalSemanticType mapping (25 → 23 values).
// Used when canonical entries are not available and we fall back to deriving
// them from the existing NoteCard[] study model output.
const NOTE_CARD_CANONICAL_TYPE: Record<string, string> = {
  must_know:           "core-concept",
  mechanism:           "mechanism",
  clinical_reasoning:  "process",
  dat_trap:            "common-error",
  common_mistake:      "common-error",
  memory_hook:         "memory-anchor",
  connection_map:      "relationship",
  procedure_flow:      "process",
  clinical_pearl:      "clinical-pearl",
  expert_thinking:     "high-yield",
  why_this_matters:    "cause",
  pattern_recognition: "classification",
  decision_tree:       "decision-point",
  visual_mnemonic:     "memory-anchor",
  formula_breakdown:   "formula",
  diagram:             "core-concept",
  recall_questions:    "high-yield",
  exam_strategy:       "high-yield",
  surgeon_lens:        "clinical-pearl",
  master_concepts:     "core-concept",
  worked_example:      "worked-example",
  case_challenge:      "decision-point",
  quick_review:        "high-yield",
  complication_risk:   "complication",
  other:               "core-concept",
};

/** Minimal NoteCard shape required for conversion — avoids importing the full type. */
export interface NoteCardLike {
  type:        string;
  title:       string;
  body:        string;
  priorityTier: number | null;
}

/**
 * Convert NoteCard[] to CanonicalEntryInput[] so WhiteboardPanel can build a
 * VSG from the existing study model data path while canonical IDB entries are
 * not yet available (pre-Phase 3 One Brain sync).
 */
export function noteCardsToCanonicalEntries(
  cards:  NoteCardLike[],
  prefix: string = "nc",
): CanonicalEntryInput[] {
  return cards.map((card, i) => ({
    id:            `${prefix}_${i}_${card.title.slice(0, 20).replace(/\s+/g, "_")}`,
    text:          card.body,
    title:         card.title || undefined,
    canonicalType: NOTE_CARD_CANONICAL_TYPE[card.type] ?? "core-concept",
    priorityTier:  card.priorityTier ?? undefined,
  }));
}

// ── SurgeonAnnotationPlan adapter ───────────────────────────────────────────────
// The deterministic Scene Builder's real data source: OpenAI reads the current
// page fresh and returns classified, verbatim-quote-grounded annotations (see
// lib/insights/pageAnnotationPlan.ts) — no Claude call, no image generation
// required for the diagram itself. This adapter converts that grounded output
// into CanonicalEntryInput[] so WhiteboardPanel can build a VSG from real
// page content instead of falling back to noteCardsToCanonicalEntries() above.

// SurgeonAnnotationPlan.canonicalType (8 values) → the bare-string taxonomy
// canonicalRelationshipGraph.ts's RULES/LAYOUT_PRIORITY and this file's
// CANONICAL_TIER_OVERRIDE key on. Not a 1:1 rename — "procedure" maps to the
// closest existing concept ("process"), and "trap"/"clinicalPearl" map onto
// values that already carry a tier override (warning→danger, clinical-pearl→
// pearl), giving the whiteboard the same red/cyan tiers the PDF overlay uses
// for the same canonicalType via lib/insights/pageAnnotationPlan.ts's treatment
// field — cross-surface visual consistency without threading `treatment` itself
// into the VSG, which has its own independent tier/role vocabulary.
const SURGEON_CANONICAL_TYPE_TO_VSG_TYPE: Record<CanonicalType, string> = {
  definition:         "definition",
  mechanism:          "mechanism",
  procedure:          "process",
  decision:           "decision-point",
  comparison:         "comparison",
  trap:               "warning",
  clinicalPearl:      "clinical-pearl",
  supportingEvidence: "evidence",
};

// SurgeonAnnotationPlan.importance (3 values) → priorityTier (1–5), consumed by
// resolveImportanceLevel()/importanceLevelFromTier() in lib/reader/importanceBadge.ts:
// tier>=5→critical, tier>=4→high, tier>=3→medium, tier<3→reference.
const SURGEON_IMPORTANCE_TO_PRIORITY_TIER: Record<Importance, number> = {
  critical:   5,
  high:       4,
  supporting: 2, // → "reference", the lowest VSG tier — matches "supporting" being the lowest SurgeonAnnotationPlan tier
};

/**
 * Convert GroundedSurgeonAnnotation[] (the deterministic, page-verified output
 * of the SurgeonAnnotationPlan pipeline, already density-limited by
 * limitAnnotationDensity() before it ever reaches this adapter) into
 * CanonicalEntryInput[] for the Scene Builder.
 *
 * Each entry's id is buildSurgeonEvidenceId(pageNumber, index) — the SAME id
 * format components/reader/useSurgeonAnnotations.ts uses for
 * HighlightTarget.evidenceRefId. That shared id is what makes a PDF highlight
 * and its corresponding whiteboard node cross-highlight with zero extra sync
 * code: both already write to the same global focusedEvidenceId/activeAnchorId
 * state via TldrawCanvas's existing sourceId-keyed click sync. Callers MUST
 * pass the array in the same order it was produced by groundSurgeonQuotes() —
 * index `i` here must match the index used to build the corresponding
 * HighlightTarget for a given annotation.
 */
export function surgeonAnnotationsToCanonicalEntries(
  grounded:   GroundedSurgeonAnnotation[],
  pageNumber: number,
): CanonicalEntryInput[] {
  return grounded.map((g, i) => ({
    id:            buildSurgeonEvidenceId(pageNumber, i),
    text:          g.groundedText,
    canonicalType: SURGEON_CANONICAL_TYPE_TO_VSG_TYPE[g.canonicalType],
    priorityTier:  SURGEON_IMPORTANCE_TO_PRIORITY_TIER[g.importance],
    page:          pageNumber,
  }));
}
