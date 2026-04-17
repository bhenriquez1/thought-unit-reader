// lib/highlights/buildHighlightRects.ts

import type {
  MatchConfidence,
  NeighborhoodMemberKind,
  TextSpanCandidate,
} from "./matchNeighborhoodMemberToText";

export interface TextItemRect {
  id: string;
  pageNumber: number;
  text: string;
  normalizedText?: string;
  startOffset: number;
  endOffset: number;
  x: number;
  y: number;
  width: number;
  height: number;
  paragraphId?: string;
  sentenceId?: string;
}

export interface NeighborhoodMemberPlacement {
  memberId: string;
  kind: NeighborhoodMemberKind;
  text: string;
  candidate: TextSpanCandidate | null;
}

export type HighlightTier = "important" | "support" | "additional" | "trap";

export interface HighlightOverlayRect {
  id: string;
  memberId: string;
  kind: NeighborhoodMemberKind;
  tier: HighlightTier;
  pageNumber: number;
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  confidence: MatchConfidence;
  displayMode: "full" | "reduced" | "minimal" | "hidden";
  startOffset?: number;
  endOffset?: number;
}

export interface BuildHighlightRectsInput {
  pageNumber: number;
  placements: NeighborhoodMemberPlacement[];
  textItemRects: TextItemRect[];
  pageWidth?: number;
}

export interface BuildHighlightRectsResult {
  overlays: HighlightOverlayRect[];
  skipped: Array<{
    memberId: string;
    reason: "no_candidate" | "no_rects" | "weak_confidence";
  }>;
}

export function buildHighlightRects(
  input: BuildHighlightRectsInput
): BuildHighlightRectsResult {
  const pageRects = input.textItemRects.filter(
    (r) => r.pageNumber === input.pageNumber
  );

  const overlays: HighlightOverlayRect[] = [];
  const skipped: BuildHighlightRectsResult["skipped"] = [];

  for (const placement of input.placements) {
    const candidate = placement.candidate;

    if (!candidate) {
      skipped.push({
        memberId: placement.memberId,
        reason: "no_candidate",
      });
      continue;
    }

    const matchedRects = resolveRectsFromCandidate(candidate, pageRects);

    if (!matchedRects.length) {
      skipped.push({
        memberId: placement.memberId,
        reason: "no_rects",
      });
      continue;
    }

    const mergedRects = mergeHighlightRects(
      matchedRects,
      input.pageWidth ?? inferPageWidth(pageRects)
    );

    const displayMode = decideDisplayMode(candidate.confidence, mergedRects.length);
    if (displayMode === "hidden") {
      skipped.push({
        memberId: placement.memberId,
        reason: "weak_confidence",
      });
      continue;
    }

    overlays.push({
      id: `overlay-${placement.memberId}`,
      memberId: placement.memberId,
      kind: placement.kind,
      tier: tierFromKind(placement.kind),
      pageNumber: input.pageNumber,
      rects: mergedRects.map((r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      })),
      confidence: candidate.confidence,
      displayMode,
      startOffset: candidate.startOffset,
      endOffset: candidate.endOffset,
    });
  }

  return {
    overlays: sortOverlaysInReadingOrder(overlays),
    skipped,
  };
}

/* -------------------------------------------------------------------------- */
/*                               RECT RESOLUTION                              */
/* -------------------------------------------------------------------------- */

function resolveRectsFromCandidate(
  candidate: TextSpanCandidate,
  rects: TextItemRect[]
): TextItemRect[] {
  let matched = rects.filter((rect) =>
    overlaps(
      candidate.startOffset,
      candidate.endOffset,
      rect.startOffset,
      rect.endOffset
    )
  );

  if (!matched.length && candidate.sentenceId) {
    matched = rects.filter((rect) => rect.sentenceId === candidate.sentenceId);
  }

  if (!matched.length && candidate.paragraphId) {
    matched = rects.filter((rect) => rect.paragraphId === candidate.paragraphId);
  }

  return matched.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });
}

/* -------------------------------------------------------------------------- */
/*                              HIGHLIGHT RENDERING                           */
/* -------------------------------------------------------------------------- */

function tierFromKind(kind: NeighborhoodMemberKind): HighlightTier {
  switch (kind) {
    case "anchor":
      return "important";
    case "support":
      return "support";
    case "additional":
      return "additional";
    case "trap":
      return "trap";
    default:
      return "additional";
  }
}

function decideDisplayMode(
  confidence: MatchConfidence,
  rectCount: number
): HighlightOverlayRect["displayMode"] {
  switch (confidence) {
    case "exact":
      return "full";
    case "strong":
      return rectCount <= 4 ? "full" : "reduced";
    case "approximate":
      return rectCount <= 3 ? "reduced" : "minimal";
    case "weak":
      return rectCount <= 2 ? "minimal" : "hidden";
    case "none":
    default:
      return "hidden";
  }
}

/* -------------------------------------------------------------------------- */
/*                                RECT MERGING                                */
/* -------------------------------------------------------------------------- */

interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

function mergeHighlightRects(rects: RectLike[], pageWidth: number): RectLike[] {
  const sorted = [...rects].sort((a, b) =>
    a.y !== b.y ? a.y - b.y : a.x - b.x
  );

  const merged: RectLike[] = [];

  for (const rect of sorted) {
    const last = merged[merged.length - 1];

    if (!last) {
      merged.push({ ...rect });
      continue;
    }

    const sameColumn =
      inferColumn(last, pageWidth) === inferColumn(rect, pageWidth);

    const verticallyClose =
      Math.abs(last.y - rect.y) <= Math.max(last.height, rect.height) * 0.55;

    const horizontallyTouching =
      gapBetween(last, rect) <= Math.max(10, Math.min(last.height, rect.height) * 0.9);

    const strongHorizontalOverlap =
      overlapRatio(last.x, last.x + last.width, rect.x, rect.x + rect.width) > 0.22;

    if (
      sameColumn &&
      verticallyClose &&
      (horizontallyTouching || strongHorizontalOverlap)
    ) {
      const x1 = Math.min(last.x, rect.x);
      const y1 = Math.min(last.y, rect.y);
      const x2 = Math.max(last.x + last.width, rect.x + rect.width);
      const y2 = Math.max(last.y + last.height, rect.y + rect.height);

      last.x = x1;
      last.y = y1;
      last.width = x2 - x1;
      last.height = y2 - y1;
    } else {
      merged.push({ ...rect });
    }
  }

  return merged;
}

function inferColumn(rect: RectLike, pageWidth: number): "left" | "right" | "full" {
  if (!pageWidth || pageWidth <= 0) return "full";
  if (rect.width > pageWidth * 0.72) return "full";

  const center = rect.x + rect.width / 2;
  return center < pageWidth / 2 ? "left" : "right";
}

function gapBetween(a: RectLike, b: RectLike): number {
  if (b.x >= a.x) return Math.max(0, b.x - (a.x + a.width));
  return Math.max(0, a.x - (b.x + b.width));
}

function overlapRatio(a1: number, a2: number, b1: number, b2: number): number {
  const left = Math.max(a1, b1);
  const right = Math.min(a2, b2);
  const intersection = Math.max(0, right - left);
  const minWidth = Math.min(a2 - a1, b2 - b1);
  return minWidth > 0 ? intersection / minWidth : 0;
}

/* -------------------------------------------------------------------------- */
/*                                   SORTING                                  */
/* -------------------------------------------------------------------------- */

function sortOverlaysInReadingOrder(
  overlays: HighlightOverlayRect[]
): HighlightOverlayRect[] {
  return [...overlays].sort((a, b) => {
    const aTop = a.rects[0]?.y ?? 0;
    const bTop = b.rects[0]?.y ?? 0;
    if (aTop !== bTop) return aTop - bTop;

    const aLeft = a.rects[0]?.x ?? 0;
    const bLeft = b.rects[0]?.x ?? 0;
    return aLeft - bLeft;
  });
}

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function inferPageWidth(rects: TextItemRect[]): number {
  if (!rects.length) return 1000;
  return Math.max(...rects.map((r) => r.x + r.width));
}
