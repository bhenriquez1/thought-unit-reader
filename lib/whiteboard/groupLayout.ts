// lib/whiteboard/groupLayout.ts
// Deterministic, measured, collision-free geometry engine for the
// professor-performance whiteboard — the direct fix for "shapes overlap,
// labels cross, no visual hierarchy." Consumes the AI's semantic
// ProfessorGroup[] (meaning only — see professorLessonPlan.ts's
// ProfessorGroupSchema) and produces real pixel bounds. OpenAI still never
// chooses a coordinate; this module is the "deterministic code transforms
// groups into coordinates" half of that split.
//
// Placement strategy, in group.order sequence (the SAME order nodeScripts
// narrates its member nodes in, so the spatial build order and the spoken
// narrative order can never diverge):
//   - every group lays out its own nodes as a single top-to-bottom column,
//     sized from the REAL final shortLabel (measured width AND wrapped
//     height — not a pre-AI estimate), EXCEPT:
//   - a "comparison" group splits its nodes into two side-by-side columns,
//     so the contrast reads left-vs-right rather than stacked;
//   - a "warning" group reads as set apart from the main flow — it's placed
//     in a side lane beside the group immediately before it, rather than
//     consuming its own full-width row.
// Groups stack vertically (GROUP_GAP_Y between each). After every node has a
// provisional box, one deterministic AABB collision pass
// (resolveCollisions()) pushes any still-overlapping pair apart — a backstop
// for cases the region logic above didn't fully account for (e.g. a
// side-lane warning whose column is taller than the group it sits beside).

import type { GroupType } from "./professorLessonPlan";
import { estimateLabelWidth, estimateLabelHeight } from "./textMetrics";

export interface LayoutBox { x: number; y: number; w: number; h: number; }
export interface LayoutPoint { x: number; y: number; }

export interface GroupLayoutNodeInput {
  id: string;
  label: string;
}

export interface GroupLayoutGroupInput {
  id: string;
  type: GroupType;
  order: number;
  nodeIds: string[];
}

export interface GroupLayoutResult {
  /** Final bounds for every node that belonged to a non-empty group. A node
   *  id absent from the input groups (shouldn't happen post-groundProfessorLesson,
   *  which guarantees every surviving node lands in some group) simply has
   *  no entry here — callers must treat a missing id as "not drawn." */
  nodeBounds: Map<string, LayoutBox>;
  /** Bounding box of each group's own region — lets callers batch camera
   *  moves per teaching region instead of per individual object. */
  groupBounds: Map<string, LayoutBox>;
  canvas: { width: number; height: number };
}

const CANVAS_MARGIN = 40;
const NODE_GAP_Y = 24;
const NODE_GAP_X = 28;
const GROUP_GAP_Y = 56;

interface SizedNode {
  id: string;
  w: number;
  h: number;
}

function sizeNodes(nodeIds: string[], nodeById: Map<string, GroupLayoutNodeInput>): SizedNode[] {
  return nodeIds
    .map(id => nodeById.get(id))
    .filter((n): n is GroupLayoutNodeInput => Boolean(n))
    .map(n => ({ id: n.id, w: estimateLabelWidth(n.label), h: estimateLabelHeight(n.label) }));
}

function layoutColumn(sized: SizedNode[], x: number, top: number, nodeBounds: Map<string, LayoutBox>): LayoutBox {
  let y = top;
  let width = 0;
  for (const s of sized) {
    nodeBounds.set(s.id, { x, y, w: s.w, h: s.h });
    width = Math.max(width, s.w);
    y += s.h + NODE_GAP_Y;
  }
  const height = sized.length > 0 ? y - NODE_GAP_Y - top : 0;
  return { x, y: top, w: width, h: height };
}

function boxUnion(boxes: LayoutBox[]): LayoutBox {
  const xs = boxes.map(b => b.x);
  const ys = boxes.map(b => b.y);
  const x2s = boxes.map(b => b.x + b.w);
  const y2s = boxes.map(b => b.y + b.h);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...x2s) - x, h: Math.max(...y2s) - y };
}

function overlaps(a: LayoutBox, b: LayoutBox): boolean {
  return a.x < b.x + b.w && a.x + b.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Deterministic AABB backstop: process boxes sorted by (y, x); if a box
 *  overlaps any already-placed box, push it straight down past that box and
 *  re-check — repeat until clear. Always moves the LATER box (never an
 *  already-placed earlier one), so this converges monotonically and never
 *  re-opens an overlap it already resolved. */
function resolveCollisions(nodeBounds: Map<string, LayoutBox>): Map<string, LayoutBox> {
  const entries = Array.from(nodeBounds.entries()).map(([id, box]) => ({ id, box: { ...box } }));
  entries.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));

  const placed: LayoutBox[] = [];
  for (const entry of entries) {
    let moved = true;
    let guard = 0;
    while (moved && guard < entries.length + 1) {
      moved = false;
      for (const other of placed) {
        if (overlaps(entry.box, other)) {
          entry.box.y = other.y + other.h + NODE_GAP_Y;
          moved = true;
        }
      }
      guard++;
    }
    placed.push(entry.box);
  }

  const result = new Map<string, LayoutBox>();
  for (const e of entries) result.set(e.id, e.box);
  return result;
}

/**
 * Place every group (in group.order sequence), then every node within each
 * group, then run the collision backstop. Pure function — no randomness, no
 * Date.now(); the same (nodes, groups) input always produces the same
 * output, which is what makes a cached ProfessorLessonPlan safe to replay.
 */
export function computeGroupLayout(
  nodes: GroupLayoutNodeInput[],
  groups: GroupLayoutGroupInput[],
): GroupLayoutResult {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  const nodeBounds = new Map<string, LayoutBox>();
  const groupBounds = new Map<string, LayoutBox>();

  let cursorY = CANVAS_MARGIN;
  let maxX = CANVAS_MARGIN;
  let previousRegion: LayoutBox | null = null;

  for (const group of sortedGroups) {
    const sized = sizeNodes(group.nodeIds, nodeById);
    if (sized.length === 0) continue; // groundProfessorLesson never emits these, but stay defensive

    let region: LayoutBox;

    if (group.type === "comparison" && sized.length >= 2) {
      const mid = Math.ceil(sized.length / 2);
      const colA = sized.slice(0, mid);
      const colB = sized.slice(mid);
      const boxA = layoutColumn(colA, CANVAS_MARGIN, cursorY, nodeBounds);
      const boxB = layoutColumn(colB, CANVAS_MARGIN + boxA.w + NODE_GAP_X, cursorY, nodeBounds);
      region = boxUnion([boxA, boxB]);
      cursorY = region.y + region.h + GROUP_GAP_Y;
    } else if (group.type === "warning" && previousRegion) {
      // Side lane beside the previous region — set apart from the main
      // flow's column, top-aligned with it, instead of consuming its own
      // full-width row. Does not advance cursorY on its own; the collision
      // pass reconciles anything this ends up overlapping.
      const laneX = previousRegion.x + previousRegion.w + NODE_GAP_X;
      region = layoutColumn(sized, laneX, previousRegion.y, nodeBounds);
    } else {
      region = layoutColumn(sized, CANVAS_MARGIN, cursorY, nodeBounds);
      cursorY = region.y + region.h + GROUP_GAP_Y;
    }

    groupBounds.set(group.id, region);
    maxX = Math.max(maxX, region.x + region.w);
    previousRegion = region;
  }

  const resolvedNodeBounds = resolveCollisions(nodeBounds);

  // Recompute canvas extent (and group bounds) from the POST-collision
  // positions — a side-lane warning or a collision push-down can extend past
  // the provisional cursorY/maxX computed during placement.
  let canvasWidth = maxX + CANVAS_MARGIN;
  let canvasHeight = cursorY + CANVAS_MARGIN;
  for (const box of resolvedNodeBounds.values()) {
    canvasWidth = Math.max(canvasWidth, box.x + box.w + CANVAS_MARGIN);
    canvasHeight = Math.max(canvasHeight, box.y + box.h + CANVAS_MARGIN);
  }
  for (const group of sortedGroups) {
    const memberBoxes = group.nodeIds.map(id => resolvedNodeBounds.get(id)).filter((b): b is LayoutBox => Boolean(b));
    if (memberBoxes.length > 0) groupBounds.set(group.id, boxUnion(memberBoxes));
  }

  return {
    nodeBounds: resolvedNodeBounds,
    groupBounds,
    canvas: { width: canvasWidth, height: canvasHeight },
  };
}

/** The point where a ray from box's center toward (towardX, towardY) exits
 *  box's border — i.e. the edge of `box` that actually FACES the other
 *  shape, whichever of its four sides that turns out to be. Replaces the old
 *  "always bottom-center -> top-center" connector rule: a box to the right
 *  gets an arrow leaving its right edge, one below gets its bottom edge, etc. */
export function anchorPoint(box: LayoutBox, towardX: number, towardY: number): LayoutPoint {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}
