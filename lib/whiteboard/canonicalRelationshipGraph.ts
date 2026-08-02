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
    label:          e.title ?? e.text.slice(0, 40).replace(/\s+/g, " ").trim(),
    canonicalType:  e.canonicalType ?? "core-concept",
    importanceLevel: resolveImportanceLevel(e.importanceScore, e.priorityTier),
    importanceScore: e.importanceScore,
    priorityTier:   e.priorityTier,
    text:           e.text,
    title:          e.title,
    page:           e.page,
  }));

  // Group nodes by canonicalType for rule matching.
  const byType = new Map<string, RelationshipNode[]>();
  for (const n of nodes) {
    const arr = byType.get(n.canonicalType) ?? [];
    arr.push(n);
    byType.set(n.canonicalType, arr);
  }

  // Build edges: for each rule, connect top-importance pair only.
  const edges: RelationshipEdge[] = [];
  const seenEdge = new Set<string>();

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
