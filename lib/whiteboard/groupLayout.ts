// lib/whiteboard/groupLayout.ts
// Deterministic, measured, collision-free geometry engine for the
// professor-performance whiteboard — the direct fix for "shapes overlap,
// labels cross, no visual hierarchy," extended in Phase B2 to produce a real
// composed lecture board instead of a single vertical strip. OpenAI still
// never chooses a coordinate; this module is the "deterministic code
// transforms meaning into coordinates" half of that split.
//
// Phase B2 placement strategy — REGION-based, driven by each node's own
// spatialIntent (professorLessonPlan.ts's SpatialIntentSchema), not by
// ProfessorGroup.type:
//   - "central-mechanism" nodes form the CENTER column, the board's anchor.
//   - "left-branch"/"right-branch" nodes flank the center column on either
//     side, at the SAME top y — read as branches off the main concept, not
//     stacked below it.
//   - "comparison-column" nodes form their own row below the flank row,
//     split into two side-by-side sub-columns (buildProfessorTeachingActions.ts
//     draws a real bracket divider between them, unchanged from Phase B1).
//   - "warning-aside" nodes form their own row, further below, with extra
//     separation (WARNING_EXTRA_GAP) so it reads as set apart from the main
//     explanation rather than just the next paragraph.
//   - "final-summary" nodes ALWAYS form the LAST row, regardless of their
//     narrative group.order — a closing synthesis reads at the bottom.
// A node with no matching region (shouldn't happen — spatialIntent is a
// required field) defaults to "central-mechanism". A page whose nodes are
// ALL central-mechanism collapses to exactly the old single-column behavior
// — the "smallest visual grammar that explains the page well" falls out of
// this algorithm for free, not as a special case.
//
// Within each region, nodes are placed in the SAME order group.order/
// nodeScripts narrates them (region bucketing traverses groups in order,
// preserving each group's own nodeIds order) — the spatial build order and
// the spoken narrative order still can never diverge, per Phase B1's
// original design goal.
//
// After every node has a provisional box, the SAME deterministic AABB
// collision pass as before (resolveCollisions()) pushes any still-
// overlapping pair apart — a backstop for cases the region logic above
// didn't fully account for (e.g. a very wide warning row).

import type { GroupType, SpatialIntent } from "./professorLessonPlan";
import { estimateLabelWidth, estimateLabelHeight } from "./textMetrics";

export interface LayoutBox { x: number; y: number; w: number; h: number; }
export interface LayoutPoint { x: number; y: number; }

export interface GroupLayoutNodeInput {
  id: string;
  label: string;
  /** Composition intent (Phase B1) — drives which region this node lands
   *  in. Optional only for callers that predate Phase B2 / don't care about
   *  region placement; defaults to "central-mechanism" (the single-column
   *  center lane), which reproduces the pre-B2 layout for any such caller. */
  spatialIntent?: SpatialIntent;
}

type RegionKey = "left" | "center" | "right" | "comparison" | "warning" | "summary";

function regionForSpatialIntent(intent: SpatialIntent | undefined): RegionKey {
  switch (intent) {
    case "left-branch": return "left";
    case "right-branch": return "right";
    case "comparison-column": return "comparison";
    case "warning-aside": return "warning";
    case "final-summary": return "summary";
    case "central-mechanism":
    default: return "center";
  }
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
// Phase B2 — gap between REGIONS (rows in the composed board), deliberately
// larger than GROUP_GAP_Y so a region reads as a distinct section, not just
// the next paragraph in the same flow.
const REGION_ROW_GAP = 72;
// Extra separation before the warning row on top of REGION_ROW_GAP — a trap/
// exception should read as visually set apart, not just "the next section."
const WARNING_EXTRA_GAP = 40;

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

/**
 * Phase B2 — lays out two comparison sub-columns with each PAIR of
 * corresponding items (colA[i], colB[i]) sharing the same row y, so the
 * contrast reads as a genuine side-by-side comparison ("item i vs item i")
 * instead of two independently-stacked columns that happen to drift out of
 * alignment once labels wrap to different heights. Any length mismatch
 * (colA/colB of different sizes) falls back to independent stacking for the
 * unpaired tail.
 */
function layoutPairedColumns(
  colA: SizedNode[], colB: SizedNode[], xA: number, xB: number, top: number,
  nodeBounds: Map<string, LayoutBox>,
): { boxA: LayoutBox; boxB: LayoutBox } {
  let y = top;
  let widthA = 0;
  let widthB = 0;
  const pairCount = Math.min(colA.length, colB.length);

  for (let i = 0; i < pairCount; i++) {
    const a = colA[i];
    const b = colB[i];
    const rowHeight = Math.max(a.h, b.h);
    nodeBounds.set(a.id, { x: xA, y, w: a.w, h: rowHeight });
    nodeBounds.set(b.id, { x: xB, y, w: b.w, h: rowHeight });
    widthA = Math.max(widthA, a.w);
    widthB = Math.max(widthB, b.w);
    y += rowHeight + NODE_GAP_Y;
  }

  const pairedBottom = y;
  const tailA = layoutColumn(colA.slice(pairCount), xA, pairedBottom, nodeBounds);
  const tailB = layoutColumn(colB.slice(pairCount), xB, pairedBottom, nodeBounds);

  const heightA = tailA.h > 0 ? (pairedBottom - top) + NODE_GAP_Y + tailA.h : (pairCount > 0 ? pairedBottom - NODE_GAP_Y - top : 0);
  const heightB = tailB.h > 0 ? (pairedBottom - top) + NODE_GAP_Y + tailB.h : (pairCount > 0 ? pairedBottom - NODE_GAP_Y - top : 0);

  return {
    boxA: { x: xA, y: top, w: Math.max(widthA, tailA.w), h: heightA },
    boxB: { x: xB, y: top, w: Math.max(widthB, tailB.w), h: heightB },
  };
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

/** Pushes `box` straight down, repeatedly, until it no longer overlaps any
 *  box in `obstacles` — obstacles never move. Used to place a per-step
 *  "explain" mini-diagram (lib/whiteboard/buildProfessorTeachingActions.ts)
 *  beside an already-finalized primary node box without disturbing the
 *  primary group layout resolveCollisions() above already settled. */
export function pushClearOf(box: LayoutBox, obstacles: LayoutBox[]): LayoutBox {
  let result = { ...box };
  let moved = true;
  let guard = 0;
  while (moved && guard < obstacles.length + 1) {
    moved = false;
    for (const obstacle of obstacles) {
      if (overlaps(result, obstacle)) {
        result = { ...result, y: obstacle.y + obstacle.h + NODE_GAP_Y };
        moved = true;
      }
    }
    guard++;
  }
  return result;
}

/**
 * Bucket every drawn node into its region (by spatialIntent), preserving
 * group.order/nodeIds traversal order within each bucket — the SAME
 * traversal Phase B1 used, just sorted into 6 buckets instead of driving
 * per-group placement directly. Pure — no randomness.
 */
function bucketByRegion(
  sortedGroups: GroupLayoutGroupInput[],
  nodeById: Map<string, GroupLayoutNodeInput>,
): Record<RegionKey, SizedNode[]> {
  const buckets: Record<RegionKey, SizedNode[]> = {
    left: [], center: [], right: [], comparison: [], warning: [], summary: [],
  };
  const seen = new Set<string>();
  for (const group of sortedGroups) {
    for (const id of group.nodeIds) {
      if (seen.has(id)) continue; // a node double-listed across groups is placed once
      const n = nodeById.get(id);
      if (!n) continue;
      seen.add(id);
      const region = regionForSpatialIntent(n.spatialIntent);
      buckets[region].push({ id: n.id, w: estimateLabelWidth(n.label), h: estimateLabelHeight(n.label) });
    }
  }
  return buckets;
}

/**
 * Place every node by REGION (Phase B2 — see file header), then run the
 * collision backstop. Pure function — no randomness, no Date.now(); the same
 * (nodes, groups) input always produces the same output, which is what makes
 * a cached ProfessorLessonPlan safe to replay.
 */
export function computeGroupLayout(
  nodes: GroupLayoutNodeInput[],
  groups: GroupLayoutGroupInput[],
): GroupLayoutResult {
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const sortedGroups = [...groups].sort((a, b) => a.order - b.order);

  const nodeBounds = new Map<string, LayoutBox>();
  const groupBounds = new Map<string, LayoutBox>();

  const regions = bucketByRegion(sortedGroups, nodeById);

  // ── Row 1: center flanked by left/right branches, all top-aligned so they
  //     read as branching OFF the main concept, not stacked below it. ──────
  const topY = CANVAS_MARGIN;
  const leftWidth   = regions.left.length   > 0 ? Math.max(...regions.left.map(n => n.w))   : 0;
  const centerWidth  = regions.center.length > 0 ? Math.max(...regions.center.map(n => n.w)) : 0;

  const leftX   = CANVAS_MARGIN;
  const centerX = CANVAS_MARGIN + (leftWidth > 0 ? leftWidth + NODE_GAP_X : 0);
  const rightX  = centerX + centerWidth + (centerWidth > 0 ? NODE_GAP_X : 0);

  const leftBox   = regions.left.length   > 0 ? layoutColumn(regions.left,   leftX,   topY, nodeBounds) : null;
  const centerBox = regions.center.length > 0 ? layoutColumn(regions.center, centerX, topY, nodeBounds) : null;
  const rightBox  = regions.right.length  > 0 ? layoutColumn(regions.right,  rightX,  topY, nodeBounds) : null;

  const flankBoxes = [leftBox, centerBox, rightBox].filter((b): b is LayoutBox => Boolean(b));
  let cursorY = flankBoxes.length > 0 ? Math.max(...flankBoxes.map(b => b.y + b.h)) + REGION_ROW_GAP : topY;
  let maxX = Math.max(CANVAS_MARGIN, ...flankBoxes.map(b => b.x + b.w));

  // ── Row 2: comparison-column region, split into two side-by-side columns
  //     — buildProfessorTeachingActions.ts draws a real bracket divider
  //     between them (unchanged from Phase B1), computed from these same
  //     final node bounds. ────────────────────────────────────────────────
  let comparisonBox: LayoutBox | null = null;
  if (regions.comparison.length >= 2) {
    const mid = Math.ceil(regions.comparison.length / 2);
    const colA = regions.comparison.slice(0, mid);
    const colB = regions.comparison.slice(mid);
    // Row-align each pair (colA[i] vs colB[i]) so the contrast reads as a
    // genuine side-by-side comparison, not two columns that drift apart
    // once labels wrap to different heights. colB's x depends on colA's
    // widest member, computed first.
    const colAWidth = Math.max(...colA.map(n => n.w));
    const { boxA, boxB } = layoutPairedColumns(colA, colB, CANVAS_MARGIN, CANVAS_MARGIN + colAWidth + NODE_GAP_X, cursorY, nodeBounds);
    comparisonBox = boxUnion([boxA, boxB]);
  } else if (regions.comparison.length === 1) {
    // A single surviving comparison node has nothing to contrast against —
    // draw it as a plain single column rather than a degenerate 2-column
    // split with an empty second column.
    comparisonBox = layoutColumn(regions.comparison, CANVAS_MARGIN, cursorY, nodeBounds);
  }
  if (comparisonBox) {
    cursorY = comparisonBox.y + comparisonBox.h + REGION_ROW_GAP;
    maxX = Math.max(maxX, comparisonBox.x + comparisonBox.w);
  }

  // ── Row 3: warning-aside region — extra separation on top of the normal
  //     row gap, so a trap/exception reads as set apart, not just the next
  //     paragraph. ───────────────────────────────────────────────────────
  let warningBox: LayoutBox | null = null;
  if (regions.warning.length > 0) {
    const warningY = cursorY + (cursorY > topY ? WARNING_EXTRA_GAP : 0);
    warningBox = layoutColumn(regions.warning, CANVAS_MARGIN, warningY, nodeBounds);
    cursorY = warningBox.y + warningBox.h + REGION_ROW_GAP;
    maxX = Math.max(maxX, warningBox.x + warningBox.w);
  }

  // ── Row 4: final-summary — ALWAYS last, regardless of narrative
  //     group.order, since a closing synthesis reads at the bottom. ───────
  let summaryBox: LayoutBox | null = null;
  if (regions.summary.length > 0) {
    summaryBox = layoutColumn(regions.summary, CANVAS_MARGIN, cursorY, nodeBounds);
    maxX = Math.max(maxX, summaryBox.x + summaryBox.w);
  }

  const resolvedNodeBounds = resolveCollisions(nodeBounds);

  // Recompute canvas extent (and group bounds) from the POST-collision
  // positions — the collision pass can push a box past the provisional
  // cursorY/maxX computed during placement.
  let canvasWidth = maxX + CANVAS_MARGIN;
  let canvasHeight = cursorY + CANVAS_MARGIN;
  for (const box of resolvedNodeBounds.values()) {
    canvasWidth = Math.max(canvasWidth, box.x + box.w + CANVAS_MARGIN);
    canvasHeight = Math.max(canvasHeight, box.y + box.h + CANVAS_MARGIN);
  }
  // groupBounds is keyed by ProfessorGroup.id (narrative grouping, used for
  // camera batching in buildProfessorTeachingActions.ts) — recomputed from
  // final node positions regardless of which REGION each member landed in,
  // so a group whose nodes span multiple regions still gets one framing box.
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

// ── Phase B2: connector obstacle avoidance ──────────────────────────────────
// A straight line between two anchor points can, once regions are genuinely
// spread across a 2D board, pass through a THIRD node's box that has nothing
// to do with that connection. tldraw's native arrow "bend" prop (a real,
// built-in curve — not a synthesized multi-segment path) is enough to route
// around a single obstacle without inventing a full orthogonal-routing
// engine; this stays a single, deterministic curve amount per arrow.

function pointInBox(p: LayoutPoint, box: LayoutBox): boolean {
  return p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
}

function orientation(a: LayoutPoint, b: LayoutPoint, c: LayoutPoint): number {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}

function segmentsIntersect(p1: LayoutPoint, p2: LayoutPoint, p3: LayoutPoint, p4: LayoutPoint): boolean {
  const d1 = orientation(p3, p4, p1);
  const d2 = orientation(p3, p4, p2);
  const d3 = orientation(p1, p2, p3);
  const d4 = orientation(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Does the straight segment from->to pass through box (or start/end inside
 *  it)? Pure geometry — no knowledge of which shapes these points belong to;
 *  callers are responsible for excluding the connection's own two
 *  endpoints from `box`. */
export function lineIntersectsBox(from: LayoutPoint, to: LayoutPoint, box: LayoutBox): boolean {
  if (pointInBox(from, box) || pointInBox(to, box)) return true;
  const tl = { x: box.x, y: box.y };
  const tr = { x: box.x + box.w, y: box.y };
  const bl = { x: box.x, y: box.y + box.h };
  const br = { x: box.x + box.w, y: box.y + box.h };
  return (
    segmentsIntersect(from, to, tl, tr) ||
    segmentsIntersect(from, to, tr, br) ||
    segmentsIntersect(from, to, br, bl) ||
    segmentsIntersect(from, to, bl, tl)
  );
}

const AVOIDANCE_BEND_MAGNITUDE = 60;

/**
 * A deterministic tldraw arrow `bend` value: 0 if the straight from->to line
 * doesn't cross any obstacle, otherwise a fixed-magnitude curve away from
 * the first blocking obstacle's center (sign chosen so the arc bows to
 * whichever side that obstacle ISN'T on). One bend per arrow, not a
 * multi-waypoint path — sufficient to clear a single incidental obstacle,
 * not a general maze-routing solver.
 */
export function computeAvoidanceBend(from: LayoutPoint, to: LayoutPoint, obstacles: LayoutBox[]): number {
  const blocker = obstacles.find(box => lineIntersectsBox(from, to, box));
  if (!blocker) return 0;
  const cx = blocker.x + blocker.w / 2;
  const cy = blocker.y + blocker.h / 2;
  const cross = (to.x - from.x) * (cy - from.y) - (to.y - from.y) * (cx - from.x);
  return cross >= 0 ? -AVOIDANCE_BEND_MAGNITUDE : AVOIDANCE_BEND_MAGNITUDE;
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
