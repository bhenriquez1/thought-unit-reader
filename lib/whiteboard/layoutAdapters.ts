// lib/whiteboard/layoutAdapters.ts
// Pure layout algorithms for the VisualSceneGraph.
//
// All functions operate in a 460-wide SVG coordinate space — the same space
// used by VisualSceneEngine — so positions produced here can be consumed by
// VisualSceneEngine directly, and scaled to tldraw's point space in Phase 2.
//
// No React dependencies. No side effects.

import type { NodeRole } from "./visualSceneGraph";

// ── Coordinate constants (shared with VisualSceneEngine) ─────────────────────

export const CANVAS_W   = 460;
export const NODE_W     = 290;   // full-width flow node
export const NODE_H     = 52;
export const V_GAP      = 30;    // vertical gap between stacked nodes
export const H_GAP      = 20;    // horizontal gap in side-by-side layouts
export const PAD        = 22;    // outer canvas padding

// Hub-spoke constants
export const HUB_W      = 200;
export const HUB_H      = NODE_H;
export const SPOKE_W    = 160;
export const SPOKE_H    = 48;
export const SPOKE_R    = 148;   // radius of the spoke ring around the hub

// Equation layout
export const EQ_W       = 380;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LayoutInput {
  id:   string;
  role: NodeRole;
}

export interface LayoutPosition {
  id: string;
  x:  number;
  y:  number;
  w:  number;
  h:  number;
}

// ── Algorithms ────────────────────────────────────────────────────────────────

/** Vertical chain — flow, pathway, worked-solution, cycle. */
export function flowLayout(nodes: LayoutInput[]): LayoutPosition[] {
  const sx = (CANVAS_W - NODE_W) / 2;
  return nodes.map((n, i) => ({
    id: n.id,
    x:  sx,
    y:  PAD + i * (NODE_H + V_GAP),
    w:  NODE_W,
    h:  NODE_H,
  }));
}

/** Left-to-right horizontal chain — timeline grammar. */
export function timelineLayout(nodes: LayoutInput[]): LayoutPosition[] {
  const ITEM_W  = 120;
  const H_STEP  = ITEM_W + H_GAP;
  const totalW  = nodes.length * H_STEP - H_GAP;
  const startX  = Math.max(PAD, (CANVAS_W - totalW) / 2);
  const cy      = 180;
  return nodes.map((n, i) => ({
    id: n.id,
    x:  startX + i * H_STEP,
    y:  cy - SPOKE_H / 2,
    w:  ITEM_W,
    h:  SPOKE_H,
  }));
}

/**
 * Radial hub-spoke — anatomy, case-map, system-diagram.
 * The node whose role === "hub" sits in the centre; all "spoke" nodes
 * are distributed evenly around a ring of radius SPOKE_R.
 */
export function hubSpokeLayout(nodes: LayoutInput[]): LayoutPosition[] {
  const CX = CANVAS_W / 2;
  const CY = 195;

  const hub    = nodes.find((n) => n.role === "hub") ?? nodes[0];
  const spokes = nodes.filter((n) => n.id !== hub?.id);

  const positions: LayoutPosition[] = [];

  if (hub) {
    positions.push({
      id: hub.id,
      x:  CX - HUB_W / 2,
      y:  CY - HUB_H / 2,
      w:  HUB_W,
      h:  HUB_H,
    });
  }

  const count      = spokes.length;
  const angleStep  = count > 0 ? (2 * Math.PI) / count : 0;

  spokes.forEach((n, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    positions.push({
      id: n.id,
      x:  Math.round(CX + SPOKE_R * Math.cos(angle) - SPOKE_W / 2),
      y:  Math.round(CY + SPOKE_R * Math.sin(angle) - SPOKE_H / 2),
      w:  SPOKE_W,
      h:  SPOKE_H,
    });
  });

  return positions;
}

/**
 * Two-column split — comparison draw type.
 * "left" nodes fill the left column; "right" nodes fill the right column.
 * Falls back to splitting the list in half if roles are not assigned.
 */
export function comparisonLayout(nodes: LayoutInput[]): LayoutPosition[] {
  const COL_W  = (CANVAS_W - PAD * 2 - H_GAP) / 2;
  const ROW_H  = NODE_H + V_GAP;

  const leftNodes  = nodes.filter((n) => n.role === "left");
  const rightNodes = nodes.filter((n) => n.role === "right");

  // If roles weren't pre-assigned, split the list in half
  const effective = leftNodes.length + rightNodes.length === nodes.length
    ? { left: leftNodes, right: rightNodes }
    : { left: nodes.slice(0, Math.ceil(nodes.length / 2)), right: nodes.slice(Math.ceil(nodes.length / 2)) };

  const positions: LayoutPosition[] = [];
  const maxRows = Math.max(effective.left.length, effective.right.length);

  for (let i = 0; i < maxRows; i++) {
    if (effective.left[i]) {
      positions.push({ id: effective.left[i].id,  x: PAD,                    y: PAD + i * ROW_H, w: COL_W, h: NODE_H });
    }
    if (effective.right[i]) {
      positions.push({ id: effective.right[i].id, x: PAD + COL_W + H_GAP,   y: PAD + i * ROW_H, w: COL_W, h: NODE_H });
    }
  }

  return positions;
}

/** Stacked centred rows — equation draw type (formula + worked-example pairs). */
export function equationLayout(nodes: LayoutInput[]): LayoutPosition[] {
  const sx = (CANVAS_W - EQ_W) / 2;
  return nodes.map((n, i) => ({
    id: n.id,
    x:  sx,
    y:  PAD + i * (NODE_H + V_GAP),
    w:  EQ_W,
    h:  NODE_H,
  }));
}

// ── Canvas height helper ───────────────────────────────────────────────────────

/** Minimum canvas height that fits all placed nodes, with bottom padding. */
export function canvasHeight(positions: LayoutPosition[]): number {
  if (positions.length === 0) return 300;
  const maxBottom = Math.max(...positions.map((p) => p.y + p.h));
  return maxBottom + PAD;
}
