// lib/whiteboard/canonicalRelationshipGraph.ts
// Builds a typed relationship graph from canonical thought units.
// This is the "Relationship Graph" step of the Phase 5 pipeline:
//
//   Canonical Units → Relationship Graph → Diagram Layout → Interactive Whiteboard
//
// Edges are inferred from canonical type co-occurrence rules (e.g. cause→effect,
// process→mechanism) rather than NLP on raw text — the canonicalType already
// encodes the semantic role of each unit, so structural relationships can be
// derived without an additional AI call.

import { resolveImportanceLevel, type ImportanceLevel } from "@/lib/reader/importanceBadge";
import type { DiagramPlanDrawType } from "./diagramPlan";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RelationshipEdgeType =
  | "leads_to"
  | "defines"
  | "triggers"
  | "has_exception"
  | "contrasts"
  | "applied_in"
  | "summarizes"
  | "supports"
  | "can_cause"
  | "classifies"
  | "has_warning"
  | "explains";

/** An explicit, source-declared edge from one entry to another entry in the
 *  SAME entries array — e.g. SurgeonAnnotation.relationship, resolved from
 *  its original targetIndex to the target's real entry id upstream (see
 *  lib/whiteboard/visualSceneGraph.ts's surgeonAnnotationsToCanonicalEntries).
 *  Takes priority over RULES-based / sequential-fallback edge inference. */
export interface EntryRelatesTo {
  targetId: string;
  type: RelationshipEdgeType;
  label?: string;
}

export interface RelationshipNode {
  id: string;
  label: string;
  canonicalType: string;
  importanceLevel: ImportanceLevel;
  importanceScore?: number;
  priorityTier?: number;
  text: string;
  title?: string;
  page?: number;
  /** Why this point matters — carried through unchanged from the source
   *  annotation (e.g. SurgeonAnnotation.reason) so the Professor Lesson
   *  Planner has more than a bare quote to teach from. */
  reason?: string;
  relatesTo?: EntryRelatesTo;
}

export interface RelationshipEdge {
  from: string;
  to: string;
  type: RelationshipEdgeType;
  label: string;
}

export interface RelationshipGraph {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
  /** The canonicalType that appears most often in the entry list. */
  dominantType: string | null;
  /** Recommended canvas layout derived from the dominant type cluster. */
  suggestedLayout: DiagramPlanDrawType;
  /** Importance summary for the narration step. */
  criticalCount: number;
  highCount: number;
}

// ---------------------------------------------------------------------------
// Relationship inference rules
//
// Each tuple: [fromType, toType, edgeType, humanLabel]
// Direction: entries of fromType → entries of toType
// ---------------------------------------------------------------------------

const RULES: Array<[string, string, RelationshipEdgeType, string]> = [
  ["cause",           "effect",           "leads_to",      "leads to"      ],
  ["definition",      "process",          "defines",       "defines"       ],
  ["definition",      "core-concept",     "defines",       "defines"       ],
  ["core-concept",    "process",          "triggers",      "involves"      ],
  ["process",         "mechanism",        "triggers",      "triggers"      ],
  ["mechanism",       "exception",        "has_exception", "exception"     ],
  ["mechanism",       "common-error",     "has_exception", "common error"  ],
  ["process",         "warning",          "has_warning",   "warning"       ],
  ["indication",      "contraindication", "contrasts",     "vs"            ],
  ["formula",         "worked-example",   "applied_in",    "applied in"    ],
  ["core-concept",    "high-yield",       "summarizes",    "key point"     ],
  ["process",         "high-yield",       "summarizes",    "key point"     ],
  ["evidence",        "treatment",        "supports",      "supports"      ],
  ["treatment",       "complication",     "can_cause",     "can cause"     ],
  ["classification",  "definition",       "classifies",    "classifies"    ],
  ["relationship",    "definition",       "explains",      "explains"      ],
  ["relationship",    "core-concept",     "explains",      "explains"      ],
  ["memory-anchor",   "core-concept",     "explains",      "anchors"       ],
  ["clinical-pearl",  "treatment",        "supports",      "guides"        ],
  ["decision-point",  "treatment",        "leads_to",      "leads to"      ],
];

// Fallback human label for an explicit relatesTo edge whose caller didn't
// supply its own label — first RULES row for each edgeType wins.
const RULE_EDGE_LABEL: Partial<Record<RelationshipEdgeType, string>> = {};
for (const [, , edgeType, label] of RULES) {
  if (!(edgeType in RULE_EDGE_LABEL)) RULE_EDGE_LABEL[edgeType] = label;
}

// ---------------------------------------------------------------------------
// Layout selection
//
// Maps canonical type clusters → best DiagramPlanDrawType.
// Order matters: first match wins when multiple type groups are present.
// ---------------------------------------------------------------------------

const LAYOUT_PRIORITY: Array<[Set<string>, DiagramPlanDrawType]> = [
  [new Set(["cause", "effect"]),                   "flow"      ],
  [new Set(["process", "mechanism"]),              "flow"      ],
  [new Set(["indication", "contraindication"]),    "comparison"],
  // SurgeonAnnotationPlan's "comparison" canonicalType maps directly here — no
  // existing type above matches it, so this is a standalone additive entry.
  // Placement doesn't affect selectLayout()'s first-match scan since "comparison"
  // never co-occurs with any other row's keys.
  [new Set(["comparison"]),                        "comparison"],
  [new Set(["formula", "worked-example"]),         "equation"  ],
  [new Set(["classification", "evidence"]),        "table"     ],
  [new Set(["memory-anchor"]),                     "cycle"     ],
  [new Set(["definition", "core-concept"]),        "anatomy"   ],
  [new Set(["treatment", "complication"]),         "flow"      ],
  [new Set(["high-yield", "clinical-pearl"]),      "flow"      ],
];

function selectLayout(typeCounts: Map<string, number>): DiagramPlanDrawType {
  for (const [typeSet, layout] of LAYOUT_PRIORITY) {
    if (Array.from(typeSet).some((t) => (typeCounts.get(t) ?? 0) > 0)) return layout;
  }
  return "flow";
}

// Truncate a node label at a WORD boundary, never mid-word/mid-sentence — a
// hard character-count cut (the previous behavior) produced labels like "The
// law of conservation of mass, based" or "We can illustrate this law by
// considerin", which read as broken/unfinished teaching statements.
function toLabel(text: string, maxLen = 90): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const safeCut = lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut;
  return safeCut.trim() + "…";
}

// ---------------------------------------------------------------------------
// Entry type (minimal — accepts ThoughtUnitNavigatorEntry-shaped objects)
// ---------------------------------------------------------------------------

export interface CanonicalEntryInput {
  id: string;
  text: string;
  title?: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
  page?: number;
  /** Why this point matters — see RelationshipNode.reason. */
  reason?: string;
  /** See RelationshipNode.relatesTo. */
  relatesTo?: EntryRelatesTo;
}

// ---------------------------------------------------------------------------
// buildRelationshipGraph
// ---------------------------------------------------------------------------

/**
 * Build a RelationshipGraph from canonical thought units.
 *
 * Algorithm:
 *   1. Sort entries by importance (critical first).
 *   2. Map each entry to a RelationshipNode.
 *   3. Group nodes by canonicalType.
 *   4. For each rule [T1→T2], connect the most-important T1 node to the
 *      most-important T2 node (avoids N² edges; keeps the diagram readable).
 *   5. Select the suggested canvas layout from the dominant type cluster.
 *
 * @param entries  Canonical thought units for the current page.
 * @param maxNodes Cap on included nodes (default 12 — keeps canvas legible).
 */
export function buildRelationshipGraph(
  entries: CanonicalEntryInput[],
  maxNodes = 12,
): RelationshipGraph {
  if (entries.length === 0) {
    return { nodes: [], edges: [], dominantType: null, suggestedLayout: "flow", criticalCount: 0, highCount: 0 };
  }

  // Sort by importance: critical first, then high, medium, reference.
  const RANK: Record<ImportanceLevel, number> = { critical: 0, high: 1, medium: 2, reference: 3 };
  const sorted = [...entries].sort((a, b) => {
    const aL = resolveImportanceLevel(a.importanceScore, a.priorityTier);
    const bL = resolveImportanceLevel(b.importanceScore, b.priorityTier);
    return RANK[aL] - RANK[bL];
  });

  // Cap to maxNodes; prefer critical/high.
  const capped = sorted.slice(0, maxNodes);

  // Build nodes.
  const nodes: RelationshipNode[] = capped.map((e) => ({
    id:             e.id,
    label:          e.title ?? toLabel(e.text),
    canonicalType:  e.canonicalType ?? "core-concept",
    importanceLevel: resolveImportanceLevel(e.importanceScore, e.priorityTier),
    importanceScore: e.importanceScore,
    priorityTier:   e.priorityTier,
    text:           e.text,
    title:          e.title,
    page:           e.page,
    reason:         e.reason,
    relatesTo:      e.relatesTo,
  }));

  // Group nodes by canonicalType for rule matching.
  const byType = new Map<string, RelationshipNode[]>();
  for (const n of nodes) {
    const arr = byType.get(n.canonicalType) ?? [];
    arr.push(n);
    byType.set(n.canonicalType, arr);
  }

  const edges: RelationshipEdge[] = [];
  const seenEdge = new Set<string>();

  // ── Explicit, source-declared edges take priority ───────────────────────
  // SurgeonAnnotation.relationship (resolved upstream to a real target id) is
  // a genuine claim from the same page read that selected these entries —
  // stronger evidence than the canonicalType co-occurrence rules below, which
  // only ever guess at a relationship. Added first so seenEdge prevents the
  // rules/fallback passes from duplicating or silently overriding it.
  const nodeIds = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    const rel = n.relatesTo;
    if (!rel || !nodeIds.has(rel.targetId) || rel.targetId === n.id) continue;
    const key = `${n.id}->${rel.targetId}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    edges.push({ from: n.id, to: rel.targetId, type: rel.type, label: rel.label ?? RULE_EDGE_LABEL[rel.type] ?? "related" });
  }

  // ── Rule-inferred edges (canonicalType co-occurrence) ────────────────────
  for (const [fromType, toType, edgeType, edgeLabel] of RULES) {
    const fromNodes = byType.get(fromType);
    const toNodes   = byType.get(toType);
    if (!fromNodes?.length || !toNodes?.length) continue;

    const fromNode = fromNodes[0]; // already sorted by importance
    const toNode   = toNodes[0];
    if (fromNode.id === toNode.id) continue;

    const key = `${fromNode.id}->${toNode.id}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);

    edges.push({ from: fromNode.id, to: toNode.id, type: edgeType, label: edgeLabel });
  }

  // ── Sequential fallback connectivity ────────────────────────────────────
  // RULES only connects specific canonicalType PAIRS (e.g. process→mechanism).
  // A page whose annotations are all the same type (several "definition"
  // entries, common on a real page) or an uncovered type combination
  // produces zero RULES matches — every node then renders with no connector
  // at all, i.e. floating disconnected cards instead of a diagram. Guarantee
  // every node has at least one connection by chaining adjacent nodes (in
  // the same importance-sorted order flowLayout/timelineLayout already
  // position top-to-bottom/left-to-right) wherever no RULES edge already
  // links them in either direction. This only fills gaps — it never removes
  // or overrides a more specific RULES edge.
  const hasAnyEdge = (a: string, b: string) =>
    edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (hasAnyEdge(a.id, b.id)) continue;
    const key = `${a.id}->${b.id}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    const isWarning = b.canonicalType === "warning" || b.canonicalType === "common-error";
    edges.push({
      from:  a.id,
      to:    b.id,
      type:  isWarning ? "has_warning" : "explains",
      label: isWarning ? "watch for" : "next",
    });
  }

  // Count type frequencies for layout selection.
  const typeCounts = new Map<string, number>();
  for (const n of nodes) typeCounts.set(n.canonicalType, (typeCounts.get(n.canonicalType) ?? 0) + 1);

  // Dominant type = most frequent.
  let dominantType: string | null = null;
  let maxCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxCount) { maxCount = count; dominantType = type; }
  }

  const suggestedLayout = selectLayout(typeCounts);
  const criticalCount = nodes.filter((n) => n.importanceLevel === "critical").length;
  const highCount     = nodes.filter((n) => n.importanceLevel === "high").length;

  return { nodes, edges, dominantType, suggestedLayout, criticalCount, highCount };
}
