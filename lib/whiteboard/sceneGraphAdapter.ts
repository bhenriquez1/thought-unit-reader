// lib/whiteboard/sceneGraphAdapter.ts
// Converts a VisualSceneGraph into tldraw shape definitions.
// Pure data transform — no React, no side effects.

import { createShapeId, toRichText } from "@tldraw/tldraw";
import type { VisualSceneGraph } from "./visualSceneGraph";

export interface ShapeDef {
  id:          ReturnType<typeof createShapeId>;
  type:        "geo" | "arrow";
  x:           number;
  y:           number;
  props:       Record<string, unknown>;
  sourceId?:   string;
  narration?:  string;
  revealOrder: number;
}

const TIER_COLOR: Record<string, string> = {
  master:   "yellow",
  step:     "green",
  decision: "blue",
  danger:   "red",
  pearl:    "light-blue",
};

const EDGE_COLOR: Record<string, string> = {
  causation:   "green",
  contrast:    "red",
  elaboration: "blue",
  sequence:    "grey",
  reference:   "grey",
};

export function vsgToShapeDefs(vsg: VisualSceneGraph): ShapeDef[] {
  const defs: ShapeDef[] = [];
  let order = 0;

  // ── Nodes ────────────────────────────────────────────────────────────────────
  for (const node of vsg.nodes) {
    const sid = createShapeId(`vn-${node.id}`);
    const { x, y } = node.position;
    const { w, h } = node.size;

    defs.push({
      id: sid,
      type: "geo",
      x, y,
      props: {
        geo:      node.role === "hub" ? "ellipse" : "rectangle",
        w, h,
        richText: toRichText(node.label),
        fill:     "solid",
        size:     "s",
        color:    TIER_COLOR[node.tier] ?? "blue",
      },
      sourceId:    node.sourceId,
      narration:   node.body || node.label,
      revealOrder: order++,
    });
  }

  // ── Edges ────────────────────────────────────────────────────────────────────
  for (const edge of vsg.edges) {
    const fromNode = vsg.nodes.find(n => n.id === edge.fromId);
    const toNode   = vsg.nodes.find(n => n.id === edge.toId);
    if (!fromNode || !toNode) continue;

    const sid = createShapeId(`ve-${edge.id}`);
    const isHorizontal = vsg.drawType === "timeline";

    const fx = fromNode.position.x + fromNode.size.w / 2;
    const fy = isHorizontal
      ? fromNode.position.y + fromNode.size.h / 2
      : fromNode.position.y + fromNode.size.h;
    const tx = isHorizontal
      ? toNode.position.x
      : toNode.position.x + toNode.size.w / 2;
    const ty = isHorizontal
      ? toNode.position.y + toNode.size.h / 2
      : toNode.position.y;

    defs.push({
      id: sid,
      type: "arrow",
      x: fx, y: fy,
      props: {
        kind:     "arc",
        start:    { x: 0, y: 0 },
        end:      { x: tx - fx, y: ty - fy },
        richText: toRichText(edge.label ?? ""),
        size:     "s",
        color:    EDGE_COLOR[edge.kind] ?? "grey",
      },
      narration:   edge.label ?? undefined,
      revealOrder: order++,
    });
  }

  return defs.sort((a, b) => a.revealOrder - b.revealOrder);
}
