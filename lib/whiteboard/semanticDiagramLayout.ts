// lib/whiteboard/semanticDiagramLayout.ts
// Converts a RelationshipGraph into a positioned DiagramPlan.
// This is the "Diagram Layout" step of the Phase 5 pipeline:
//
//   Canonical Units → Relationship Graph → Diagram Layout → Interactive Whiteboard
//
// Layout is zero-API-call: positions are computed geometrically from the
// graph structure and canonical type roles, then handed to Whiteboard.tsx's
// existing canvas renderer which already handles flow/anatomy/comparison/cycle/etc.

import type { RelationshipGraph, RelationshipNode, RelationshipEdge } from "./canonicalRelationshipGraph";
import {
  buildDiagramPlan,
  type DiagramPlan,
  type DiagramPlanNode,
  type DiagramPlanArrow,
  type DiagramPlanStep,
  type DiagramPlanDrawType,
} from "./diagramPlan";

// ---------------------------------------------------------------------------
// Position assignment per draw type
// ---------------------------------------------------------------------------

/** Returns normalized (0–1) x/y coordinates for a list of nodes given a layout. */
function assignPositions(
  nodes: RelationshipNode[],
  layout: DiagramPlanDrawType,
): DiagramPlanNode[] {
  const n = nodes.length;
  if (n === 0) return [];

  switch (layout) {
    case "flow": {
      // Horizontal chain: y=0.5, x evenly spaced 0.1→0.9
      return nodes.map((node, i) => ({
        id:    node.id,
        label: node.label,
        nx:    n === 1 ? 0.5 : 0.1 + (0.8 * i) / Math.max(n - 1, 1),
        ny:    0.5,
      }));
    }
    case "anatomy": {
      // First node at center; others in a ring around it.
      const positioned: DiagramPlanNode[] = [{ id: nodes[0].id, label: nodes[0].label, nx: 0.5, ny: 0.5 }];
      const ring = nodes.slice(1);
      ring.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / Math.max(ring.length, 1) - Math.PI / 2;
        positioned.push({
          id:    node.id,
          label: node.label,
          nx:    0.5 + 0.35 * Math.cos(angle),
          ny:    0.5 + 0.35 * Math.sin(angle),
        });
      });
      return positioned;
    }
    case "comparison": {
      // Two-column split: left (even indices) vs right (odd indices)
      return nodes.map((node, i) => {
        const col       = i % 2;
        const rowInCol  = Math.floor(i / 2);
        const totalRows = Math.ceil(n / 2);
        return {
          id:    node.id,
          label: node.label,
          nx:    col === 0 ? 0.25 : 0.75,
          ny:    totalRows === 1 ? 0.5 : 0.2 + (0.6 * rowInCol) / Math.max(totalRows - 1, 1),
        };
      });
    }
    case "cycle": {
      // Even ring, no center node — good for cyclic processes.
      return nodes.map((node, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        return {
          id:    node.id,
          label: node.label,
          nx:    0.5 + 0.38 * Math.cos(angle),
          ny:    0.5 + 0.38 * Math.sin(angle),
        };
      });
    }
    case "table": {
      // Grid layout: 2 columns
      const cols = 2;
      return nodes.map((node, i) => ({
        id:    node.id,
        label: node.label,
        nx:    0.25 + 0.5 * (i % cols),
        ny:    0.15 + 0.7 * Math.floor(i / cols) / Math.max(Math.ceil(n / cols) - 1, 1),
      }));
    }
    case "equation": {
      // Like flow but with more vertical spread for formula notation
      return nodes.map((node, i) => ({
        id:    node.id,
        label: node.label,
        nx:    n === 1 ? 0.5 : 0.1 + (0.8 * i) / Math.max(n - 1, 1),
        ny:    i % 2 === 0 ? 0.4 : 0.6,
      }));
    }
    default: {
      // timeline, graph → horizontal chain
      return nodes.map((node, i) => ({
        id:    node.id,
        label: node.label,
        nx:    n === 1 ? 0.5 : 0.05 + (0.9 * i) / Math.max(n - 1, 1),
        ny:    0.5,
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// buildDiagramPlanFromGraph
// ---------------------------------------------------------------------------

/**
 * Convert a RelationshipGraph into a DiagramPlan ready for Whiteboard.tsx.
 *
 * Produces a 3-step progressive reveal:
 *   Step 1 — "Foundation": critical + high nodes (the most important concepts)
 *   Step 2 — "Structure": medium + reference nodes + edges between them
 *   Step 3 — "Connections": all nodes + all edges (full picture)
 *
 * This mirrors the teaching structure in Chief Resident: introduce the core
 * concept first, then layer in supporting detail, then show the full picture.
 */
export function buildDiagramPlanFromGraph(
  graph: RelationshipGraph,
  opts: {
    title?: string;
    learningGoal?: string;
    pageNumber?: number;
    sourceThoughtUnitId?: string | null;
  } = {},
): DiagramPlan {
  const { nodes, edges, suggestedLayout, criticalCount, highCount } = graph;

  if (nodes.length === 0) {
    return buildDiagramPlan([], {
      title: opts.title ?? "Concept Overview",
      learningGoal: opts.learningGoal ?? "Understand the key concepts on this page",
      sourceThoughtUnitId: opts.sourceThoughtUnitId ?? null,
      pageNumber: opts.pageNumber ?? null,
    });
  }

  // Assign positions to all nodes under the selected layout.
  const positioned = assignPositions(nodes, suggestedLayout);
  const posMap = new Map<string, DiagramPlanNode>(positioned.map((p) => [p.id, p]));

  // Split nodes into critical/high vs medium/reference for progressive reveal.
  const coreNodes    = nodes.filter((n) => n.importanceLevel === "critical" || n.importanceLevel === "high");
  const supportNodes = nodes.filter((n) => n.importanceLevel === "medium" || n.importanceLevel === "reference");

  function toPlanNodes(ns: RelationshipNode[]): DiagramPlanNode[] {
    return ns.map((n) => posMap.get(n.id) ?? { id: n.id, label: n.label });
  }

  function toPlanArrows(es: RelationshipEdge[]): DiagramPlanArrow[] {
    return es.map((e) => ({ from: e.from, to: e.to, label: e.label }));
  }

  // Edges that connect only core nodes vs edges that involve support nodes.
  const coreNodeIds    = new Set(coreNodes.map((n) => n.id));
  const coreEdges      = edges.filter((e) => coreNodeIds.has(e.from) && coreNodeIds.has(e.to));
  const extendedEdges  = edges;

  const drawType: DiagramPlanDrawType = suggestedLayout;

  // Step 1 — Foundation: show the high-importance core.
  const step1CoreNodes = coreNodes.length > 0 ? coreNodes : nodes.slice(0, Math.ceil(nodes.length / 2));
  const step1: DiagramPlanStep = {
    title:   "Foundation",
    content: buildStepContent(step1CoreNodes, criticalCount, highCount),
    type:    "draw",
    drawType,
    nodes:   toPlanNodes(step1CoreNodes),
    arrows:  toPlanArrows(coreEdges),
    payload: { sourceField: "canonicalUnits:critical+high" },
  };

  // Step 2 — Structure: add supporting nodes and connections.
  const step2: DiagramPlanStep = {
    title:   "Structure",
    content: supportNodes.length > 0
      ? `Adding ${supportNodes.length} supporting concept${supportNodes.length !== 1 ? "s" : ""} and their relationships.`
      : "Revealing relationships between concepts.",
    type:    "draw",
    drawType,
    nodes:   toPlanNodes([...step1CoreNodes, ...supportNodes]),
    arrows:  toPlanArrows(edges.slice(0, Math.ceil(edges.length / 2))),
    payload: { sourceField: "canonicalUnits:medium+reference" },
  };

  // Step 3 — Full picture: all nodes + all edges.
  const step3: DiagramPlanStep = {
    title:   "Full Picture",
    content: "Complete semantic map for this page.",
    type:    "draw",
    drawType,
    nodes:   toPlanNodes(nodes),
    arrows:  toPlanArrows(extendedEdges),
    payload: { sourceField: "canonicalUnits:all" },
  };

  const steps: DiagramPlanStep[] = supportNodes.length > 0
    ? [step1, step2, step3]
    : [step1, step3]; // skip step 2 if no medium/reference nodes

  // Collect warnings and memory anchors from node texts for the plan metadata.
  const warnings     = nodes.filter((n) => n.canonicalType === "warning" || n.canonicalType === "contraindication").map((n) => n.label);
  const memoryHooks  = nodes.filter((n) => n.canonicalType === "memory-anchor" || n.canonicalType === "clinical-pearl").map((n) => n.label);

  const title = opts.title
    ?? (graph.dominantType
      ? `${graph.dominantType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Map`
      : "Concept Map");
  const learningGoal = opts.learningGoal
    ?? `Understand the relationships between ${nodes.length} semantic concept${nodes.length !== 1 ? "s" : ""} on this page.`;

  return buildDiagramPlan(steps, {
    title,
    learningGoal,
    sourceThoughtUnitId: opts.sourceThoughtUnitId ?? (nodes[0]?.id ?? null),
    pageNumber: opts.pageNumber ?? null,
    warnings,
    memoryHooks,
  });
}

function buildStepContent(nodes: RelationshipNode[], criticalCount: number, highCount: number): string {
  const parts: string[] = [];
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (highCount > 0)     parts.push(`${highCount} high-importance`);
  const importanceNote = parts.length > 0 ? ` (${parts.join(", ")})` : "";
  return `${nodes.length} core concept${nodes.length !== 1 ? "s" : ""}${importanceNote} grounded in canonical units.`;
}
