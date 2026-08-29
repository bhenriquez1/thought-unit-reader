// lib/notelab/notebookLayout.ts
// N3 — pure layout: VisualNotebookScene -> pixel positions.
//
// Mirrors the split lib/whiteboard/visualSceneGraph.ts already proved for
// Professor Whiteboard: the NotebookPlanner (N2) decides WHAT belongs on the
// page and how blocks relate; this file — deterministic, no AI, no
// side-effects — decides WHERE. Never the model's job, same reasoning
// buildVSG's layoutAdapters.ts documents for its own scene.
//
// "Authored, not gridded" (the correction's own framing): different
// primitives get genuinely different footprints (PRIMITIVE_DIMENSIONS), and
// a block's own composition (grouped around a diagram/concept_map/image
// anchor, chained as a timeline/flow, split as a comparison, or a plain
// stack) determines its children's arrangement — never one uniform card
// grid regardless of content.

import type { NotebookPrimitive } from "./notebookScene";
import type { FinalizedNotebookBlock, VisualNotebookScene } from "./notebookScene";

export const CANVAS_WIDTH = 960;
const GAP = 28;
const GROUP_INTERNAL_GAP = 16;

// Base footprint per primitive — the visual "weight" a block of this kind
// naturally carries. Anchor primitives (diagram/concept_map/image/table/
// timeline/flow/comparison) claim the full canvas width; short explanatory
// primitives (heading/label) stay compact; everything else lands in
// between. This alone makes two pages with different primitive mixes look
// different, before any grouping composition is applied.
const PRIMITIVE_DIMENSIONS: Record<NotebookPrimitive, { w: number; h: number }> = {
  heading:        { w: 520, h: 56 },
  label:          { w: 220, h: 44 },
  text:           { w: 620, h: 96 },
  example:        { w: 620, h: 110 },
  callout:        { w: 560, h: 96 },
  formula:        { w: 420, h: 64 },
  equation_work:  { w: 620, h: 160 },
  highlight:      { w: 560, h: 56 },
  underline:      { w: 560, h: 56 },
  source_anchor:  { w: 620, h: 72 },
  freehand:       { w: 420, h: 220 },
  diagram:        { w: CANVAS_WIDTH, h: 320 },
  concept_map:    { w: CANVAS_WIDTH, h: 320 },
  image:          { w: CANVAS_WIDTH, h: 280 },
  table:          { w: CANVAS_WIDTH, h: 220 },
  timeline:       { w: CANVAS_WIDTH, h: 160 },
  flow:           { w: CANVAS_WIDTH, h: 160 },
  comparison:     { w: CANVAS_WIDTH, h: 220 },
  // Connectors have no box of their own — resolved into `connections`
  // below and given a nominal 0-size footprint here only so every
  // primitive has a table entry (never an implicit fallback).
  arrow:          { w: 0, h: 0 },
  connector:      { w: 0, h: 0 },
};

const CONNECTOR_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set(["arrow", "connector"]);
const ANCHOR_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set(["diagram", "concept_map", "image"]);
const CHAIN_PRIMITIVES: ReadonlySet<NotebookPrimitive> = new Set(["timeline", "flow"]);

export interface PositionedNotebookBlock extends FinalizedNotebookBlock {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A resolved arrow/connector — endpoints are the nearest preceding/
 *  following non-connector sibling WITHIN THE SAME GROUP, by `order`. An
 *  arrow/connector block with no such pair on both sides is dropped: never
 *  drawn pointing at nothing. */
export interface NotebookConnection {
  blockId: string;
  primitive: "arrow" | "connector";
  fromBlockId: string;
  toBlockId: string;
}

export interface NotebookLayoutResult {
  blocks: PositionedNotebookBlock[];
  connections: NotebookConnection[];
  canvasWidth: number;
  canvasHeight: number;
}

type Composition = "anchor" | "chain" | "comparison" | "stack" | "single";

function classifyGroup(blocks: FinalizedNotebookBlock[]): Composition {
  if (blocks.length <= 1) return "single";
  if (blocks.some((b) => ANCHOR_PRIMITIVES.has(b.primitive))) return "anchor";
  if (blocks.some((b) => CHAIN_PRIMITIVES.has(b.primitive))) return "chain";
  if (blocks.some((b) => b.primitive === "comparison")) return "comparison";
  return "stack";
}

/** Resolves each connector block in a group to its nearest non-connector
 *  neighbors by `order`, dropping any connector missing a neighbor on
 *  either side. */
function resolveConnections(groupBlocks: FinalizedNotebookBlock[]): NotebookConnection[] {
  const content = groupBlocks.filter((b) => !CONNECTOR_PRIMITIVES.has(b.primitive)).sort((a, b) => a.order - b.order);
  const connectors = groupBlocks.filter((b) => CONNECTOR_PRIMITIVES.has(b.primitive));
  const connections: NotebookConnection[] = [];
  for (const connector of connectors) {
    let from: FinalizedNotebookBlock | undefined;
    let to: FinalizedNotebookBlock | undefined;
    for (const c of content) {
      if (c.order <= connector.order) from = c;
      else { to = c; break; }
    }
    if (from && to) {
      connections.push({
        blockId: connector.id,
        primitive: connector.primitive as "arrow" | "connector",
        fromBlockId: from.id,
        toBlockId: to.id,
      });
    }
  }
  return connections;
}

function layoutAnchorGroup(blocks: FinalizedNotebookBlock[], top: number): PositionedNotebookBlock[] {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const anchor = sorted.find((b) => ANCHOR_PRIMITIVES.has(b.primitive)) ?? sorted[0];
  const children = sorted.filter((b) => b.id !== anchor.id && !CONNECTOR_PRIMITIVES.has(b.primitive));

  const positioned: PositionedNotebookBlock[] = [];
  const anchorDim = PRIMITIVE_DIMENSIONS[anchor.primitive];
  positioned.push({ ...anchor, x: 0, y: top, w: anchorDim.w, h: anchorDim.h });

  // Children (typically label/text annotations) flow beneath the anchor,
  // wrapping left to right — the anchor is the visual center; its labels
  // orbit underneath rather than stacking in one more identical column.
  let cx = 0;
  let cy = top + anchorDim.h + GROUP_INTERNAL_GAP;
  let rowH = 0;
  for (const child of children) {
    const dim = PRIMITIVE_DIMENSIONS[child.primitive];
    if (cx + dim.w > CANVAS_WIDTH && cx > 0) {
      cx = 0;
      cy += rowH + GROUP_INTERNAL_GAP;
      rowH = 0;
    }
    positioned.push({ ...child, x: cx, y: cy, w: dim.w, h: dim.h });
    cx += dim.w + GROUP_INTERNAL_GAP;
    rowH = Math.max(rowH, dim.h);
  }
  return positioned;
}

function layoutChainGroup(blocks: FinalizedNotebookBlock[], top: number): PositionedNotebookBlock[] {
  const sorted = [...blocks].filter((b) => !CONNECTOR_PRIMITIVES.has(b.primitive)).sort((a, b) => a.order - b.order);
  const positioned: PositionedNotebookBlock[] = [];
  let x = 0;
  const stepW = Math.min(260, Math.floor((CANVAS_WIDTH - GROUP_INTERNAL_GAP * (sorted.length - 1)) / Math.max(1, sorted.length)));
  const h = 140;
  for (const block of sorted) {
    positioned.push({ ...block, x, y: top, w: stepW, h });
    x += stepW + GROUP_INTERNAL_GAP;
  }
  return positioned;
}

function layoutComparisonGroup(blocks: FinalizedNotebookBlock[], top: number): PositionedNotebookBlock[] {
  const sorted = [...blocks].filter((b) => !CONNECTOR_PRIMITIVES.has(b.primitive)).sort((a, b) => a.order - b.order);
  const columns = Math.max(2, sorted.length);
  const colW = Math.floor((CANVAS_WIDTH - GROUP_INTERNAL_GAP * (columns - 1)) / columns);
  const h = 200;
  return sorted.map((block, i) => ({ ...block, x: i * (colW + GROUP_INTERNAL_GAP), y: top, w: colW, h }));
}

function layoutStackGroup(blocks: FinalizedNotebookBlock[], top: number): PositionedNotebookBlock[] {
  const sorted = [...blocks].filter((b) => !CONNECTOR_PRIMITIVES.has(b.primitive)).sort((a, b) => a.order - b.order);
  const positioned: PositionedNotebookBlock[] = [];
  let y = top;
  // A modest, deterministic indent per step — reads as one authored
  // train of thought, not a rigid list.
  for (let i = 0; i < sorted.length; i++) {
    const block = sorted[i];
    const dim = PRIMITIVE_DIMENSIONS[block.primitive];
    const indent = Math.min(i * 24, 96);
    positioned.push({ ...block, x: indent, y, w: dim.w, h: dim.h });
    y += dim.h + GROUP_INTERNAL_GAP;
  }
  return positioned;
}

/**
 * Compose a VisualNotebookScene into pixel positions. Pure and
 * deterministic: the same scene always produces the same layout.
 */
export function layoutNotebookScene(scene: VisualNotebookScene): NotebookLayoutResult {
  // Group by groupId; a null groupId is its own singleton group so it lays
  // out through the same "single" composition path as a real 1-block group.
  const groups = new Map<string, FinalizedNotebookBlock[]>();
  let ungroupedOrdinal = 0;
  for (const block of scene.blocks) {
    const key = block.groupId ?? `__solo_${ungroupedOrdinal++}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(block);
    else groups.set(key, [block]);
  }

  // Rows are ordered by the minimum `order` among each group's own blocks —
  // the scene's own composition order, not insertion order into the Map.
  const rows = [...groups.values()].sort(
    (a, b) => Math.min(...a.map((x) => x.order)) - Math.min(...b.map((x) => x.order)),
  );

  const positioned: PositionedNotebookBlock[] = [];
  const connections: NotebookConnection[] = [];
  let cursorY = 0;

  for (const groupBlocks of rows) {
    const composition = classifyGroup(groupBlocks);
    let rowBlocks: PositionedNotebookBlock[];

    if (composition === "single") {
      const only = groupBlocks[0];
      if (CONNECTOR_PRIMITIVES.has(only.primitive)) continue; // an orphaned connector draws nothing
      const dim = PRIMITIVE_DIMENSIONS[only.primitive];
      rowBlocks = [{ ...only, x: 0, y: cursorY, w: dim.w, h: dim.h }];
    } else {
      connections.push(...resolveConnections(groupBlocks));
      rowBlocks =
        composition === "anchor" ? layoutAnchorGroup(groupBlocks, cursorY)
        : composition === "chain" ? layoutChainGroup(groupBlocks, cursorY)
        : composition === "comparison" ? layoutComparisonGroup(groupBlocks, cursorY)
        : layoutStackGroup(groupBlocks, cursorY);
    }

    positioned.push(...rowBlocks);
    if (rowBlocks.length > 0) {
      cursorY = Math.max(...rowBlocks.map((b) => b.y + b.h)) + GAP;
    }
  }

  return {
    blocks: positioned,
    connections,
    canvasWidth: CANVAS_WIDTH,
    canvasHeight: positioned.length ? Math.max(...positioned.map((b) => b.y + b.h)) : 0,
  };
}
