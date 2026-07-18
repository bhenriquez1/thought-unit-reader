// lib/learningHub/hierarchyBuilder.ts
// Builds a structured Part → Chapter → Section → Subsection tree from a
// flat list of SyllabusNodes, enriching each node with a DisplayTitle.
//
// The Learning Hub uses this tree to render the Book Roadmap.
// Sections and subsections are collapsed by default in the UI.

import type { SyllabusNode } from "@/lib/syllabus/types";
import { normalizeDisplayTitle } from "./titleNormalizer";
import type { DisplayTitle, DisplayTitleSource, HierarchyLevel } from "./titleNormalizer";

/* ─── Learning Hub node ──────────────────────────────────────────────────────── */

export type LearningHubNodeStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "needs-review";

export type LearningHubNode = SyllabusNode & {
  displayTitle:   DisplayTitle;
  hubLevel:       HierarchyLevel;
  /** Child nodes one level down (sections within a chapter, etc.) */
  children:       LearningHubNode[];
  status:         LearningHubNodeStatus;
};

/* ─── Tree structure ─────────────────────────────────────────────────────────── */

export type LearningHubGroup = {
  /** Part / Unit group (may be null if no parts in this book) */
  label:       string | null;
  displayTitle: DisplayTitle | null;
  chapters:    LearningHubNode[];
};

export type LearningHubTree = {
  groups:          LearningHubGroup[];
  /** Flat list of all nodes in recommended order */
  flatNodes:       LearningHubNode[];
  totalNodes:      number;
  /** Nodes without a detected part/unit group */
  ungroupedCount:  number;
};

/* ─── Source mapping ─────────────────────────────────────────────────────────── */

function toDisplaySource(src: SyllabusNode["source"]): DisplayTitleSource {
  if (src === "bookmark") return "bookmark";
  if (src === "toc")      return "toc";
  if (src === "heading")  return "heading";
  return "inferred";
}

/* ─── Hub level from SyllabusNode nodeType ──────────────────────────────────── */

function hubLevelFromNodeType(nodeType: SyllabusNode["nodeType"], title: DisplayTitle): HierarchyLevel {
  // If normalizer detected a level from the title prefix, trust it
  if (title.level !== "unknown") return title.level;

  // Fall back to nodeType mapping
  switch (nodeType) {
    case "part":       return "part";
    case "chapter":    return "chapter";
    case "section":    return "section";
    case "subsection": return "subsection";
    default:           return "unknown";
  }
}

/* ─── Build a LearningHubNode from a SyllabusNode ─────────────────────────────── */

function toLearningHubNode(
  node:    SyllabusNode,
  allNodes: SyllabusNode[],
  depth:   number = 0,
): LearningHubNode {
  const displayTitle = normalizeDisplayTitle(node.title, {
    source:       toDisplaySource(node.source),
    safeFallback: buildSafeFallback(node, allNodes),
  });
  const hubLevel = hubLevelFromNodeType(node.nodeType, displayTitle);

  // Attach children recursively (direct children only at this depth)
  const children: LearningHubNode[] = depth < 3
    ? allNodes
        .filter(n => n.parentId === node.id)
        .map(n => toLearningHubNode(n, allNodes, depth + 1))
    : [];

  return {
    ...node,
    displayTitle,
    hubLevel,
    children,
    status: "not-started",
  };
}

/** Safe fallback: "Chapter N", "Section N", etc. based on hierarchy position */
function buildSafeFallback(node: SyllabusNode, allNodes: SyllabusNode[]): string {
  const siblings = allNodes.filter(n => n.parentId === node.parentId);
  const idx      = siblings.findIndex(n => n.id === node.id) + 1;
  switch (node.nodeType) {
    case "chapter":    return `Chapter ${idx}`;
    case "section":    return `Section ${idx}`;
    case "subsection": return `Subsection ${idx}`;
    case "part":       return `Part ${idx}`;
    default:           return `Item ${idx}`;
  }
}

/* ─── Build the full tree ─────────────────────────────────────────────────────── */

/**
 * Build a LearningHubTree from the flat SyllabusNode list of a UniversalSyllabus.
 * Groups root-level nodes by Part/Unit; ungrouped chapters go into a null group.
 *
 * @param nodes   SyllabusNode[] from UniversalSyllabus.nodes
 * @param order   Recommended node order (nodeIds) from UniversalSyllabus.recommendedOrder
 */
export function buildLearningHubTree(
  nodes: SyllabusNode[],
  order: string[] = [],
): LearningHubTree {
  // Build an ID map for fast lookup
  const byId = new Map<string, SyllabusNode>(nodes.map(n => [n.id, n]));

  // Root nodes = no parent or parent not in the set
  const roots = nodes.filter(n => !n.parentId || !byId.has(n.parentId));

  // Apply recommended order to roots if provided
  if (order.length > 0) {
    const orderIdx = new Map<string, number>(order.map((id, i) => [id, i]));
    roots.sort((a, b) => (orderIdx.get(a.id) ?? 999) - (orderIdx.get(b.id) ?? 999));
  }

  // Convert roots to LearningHubNodes
  const rootHubNodes = roots.map(n => toLearningHubNode(n, nodes));

  // Separate parts/units from chapters and ungrouped content
  const parts    = rootHubNodes.filter(n => n.hubLevel === "part" || n.hubLevel === "unit");
  const chapters = rootHubNodes.filter(n => n.hubLevel === "chapter");
  const other    = rootHubNodes.filter(n => n.hubLevel !== "part" && n.hubLevel !== "unit" && n.hubLevel !== "chapter");

  const groups: LearningHubGroup[] = [];

  if (parts.length > 0) {
    for (const part of parts) {
      // Chapters that are children of this part
      const partChapters = rootHubNodes.filter(
        n => n.parentId === part.id && n.hubLevel === "chapter",
      );
      // Also include chapters embedded directly in the part's children array
      const embeddedChapters = part.children.filter(n => n.hubLevel === "chapter");
      const allPartChapters  = partChapters.length > 0 ? partChapters : embeddedChapters;

      groups.push({
        label:        part.displayTitle.cleanedTitle,
        displayTitle: part.displayTitle,
        chapters:     allPartChapters,
      });
    }
    // Chapters not under any part go into an ungrouped group
    if (chapters.length > 0) {
      groups.push({ label: null, displayTitle: null, chapters });
    }
  } else {
    // No parts detected — all top-level nodes go into a single null group
    groups.push({
      label:        null,
      displayTitle: null,
      chapters:     [...chapters, ...other],
    });
  }

  // Flat list in order
  const flatNodes: LearningHubNode[] = [];
  function flatten(node: LearningHubNode) {
    flatNodes.push(node);
    node.children.forEach(flatten);
  }
  for (const group of groups) {
    group.chapters.forEach(flatten);
  }

  const ungroupedCount = groups.find(g => g.label === null)?.chapters.length ?? 0;

  return {
    groups,
    flatNodes,
    totalNodes:     flatNodes.length,
    ungroupedCount,
  };
}
