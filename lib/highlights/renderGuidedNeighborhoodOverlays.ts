// lib/highlights/renderGuidedNeighborhoodOverlays.ts

import type { HighlightNeighborhood } from "./buildHighlightNeighborhoods";
import type { MatchConfidence } from "./matchNeighborhoodMemberToText";
import type { HighlightOverlayRect } from "./buildHighlightRects";

export type GuidedTier =
  | "main_signal"
  | "explains_it"
  | "extra_context"
  | "do_not_confuse";

export interface GuidedNeighborhoodOverlayEntry {
  id: string;
  neighborhoodId: string;
  conceptId?: string;
  title?: string;
  order: number;
  tier: GuidedTier;
  rects: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  confidence: MatchConfidence;
  opacity: number;
  borderOpacity: number;
  zIndex: number;
  overlayLabel: "Main Signal" | "Explains It" | "Extra Context" | "Do Not Confuse";
  sourceMemberId?: string;
  text?: string;
}

export interface GuidedNeighborhoodRenderModel {
  neighborhoodId: string;
  conceptId?: string;
  title?: string;
  pageOrder: number;
  overlays: GuidedNeighborhoodOverlayEntry[];
}

export interface RenderGuidedNeighborhoodOverlaysInput {
  neighborhoods: HighlightNeighborhood[];
  overlays: HighlightOverlayRect[];
}

export interface RenderGuidedNeighborhoodOverlaysResult {
  neighborhoods: GuidedNeighborhoodRenderModel[];
  flat: GuidedNeighborhoodOverlayEntry[];
}

/**
 * Turns matched/placed overlay rects into an ordered guided-reading overlay model.
 *
 * The important behavior here is:
 * - preserve neighborhood grouping
 * - preserve page reading order
 * - preserve within-neighborhood tier order:
 *   anchor -> support -> additional -> trap
 * - apply stronger visual hierarchy than a flat highlight list
 */
export function renderGuidedNeighborhoodOverlays(
  input: RenderGuidedNeighborhoodOverlaysInput
): RenderGuidedNeighborhoodOverlaysResult {
  const overlayByMemberId = new Map<string, HighlightOverlayRect>();
  for (const overlay of input.overlays) {
    overlayByMemberId.set(overlay.memberId, overlay);
  }

  const neighborhoodModels: GuidedNeighborhoodRenderModel[] = [];

  for (const neighborhood of input.neighborhoods) {
    const entries: GuidedNeighborhoodOverlayEntry[] = [];
    let localOrder = 0;

    // 1. anchor -> Main Signal
    if (neighborhood.anchor) {
      const entry = materializeEntry(
        neighborhood,
        neighborhood.anchor.id,
        overlayByMemberId.get(neighborhood.anchor.id),
        "main_signal",
        localOrder++
      );
      if (entry) entries.push(entry);
    }

    // 2. support -> Explains It
    for (const support of neighborhood.support ?? []) {
      const entry = materializeEntry(
        neighborhood,
        support.id,
        overlayByMemberId.get(support.id),
        "explains_it",
        localOrder++
      );
      if (entry) entries.push(entry);
    }

    // 3. additional -> Extra Context
    for (const additional of neighborhood.additional ?? []) {
      const entry = materializeEntry(
        neighborhood,
        additional.id,
        overlayByMemberId.get(additional.id),
        "extra_context",
        localOrder++
      );
      if (entry) entries.push(entry);
    }

    // 4. trap -> Do Not Confuse
    if (neighborhood.trap) {
      const entry = materializeEntry(
        neighborhood,
        neighborhood.trap.id,
        overlayByMemberId.get(neighborhood.trap.id),
        "do_not_confuse",
        localOrder++
      );
      if (entry) entries.push(entry);
    }

    if (!entries.length) continue;

    const pageOrder = inferNeighborhoodPageOrder(entries);

    neighborhoodModels.push({
      neighborhoodId: neighborhood.id,
      conceptId: neighborhood.conceptId,
      title: neighborhood.title,
      pageOrder,
      overlays: sortEntriesWithinNeighborhood(entries),
    });
  }

  const sortedNeighborhoods = neighborhoodModels.sort((a, b) => {
    if (a.pageOrder !== b.pageOrder) return a.pageOrder - b.pageOrder;
    return a.neighborhoodId.localeCompare(b.neighborhoodId);
  });

  const flat = sortedNeighborhoods.flatMap((n) => n.overlays);

  return {
    neighborhoods: sortedNeighborhoods,
    flat,
  };
}

/* -------------------------------------------------------------------------- */
/*                              ENTRY MATERIALIZER                            */
/* -------------------------------------------------------------------------- */

function materializeEntry(
  neighborhood: HighlightNeighborhood,
  sourceMemberId: string,
  overlay: HighlightOverlayRect | undefined,
  tier: GuidedTier,
  order: number
): GuidedNeighborhoodOverlayEntry | null {
  if (!overlay?.rects?.length) return null;

  const confidence = overlay.confidence;
  const style = styleForTierAndConfidence(tier, confidence, overlay.displayMode);

  return {
    id: `${neighborhood.id}:${sourceMemberId}:${tier}`,
    neighborhoodId: neighborhood.id,
    conceptId: neighborhood.conceptId,
    title: neighborhood.title,
    order,
    tier,
    rects: overlay.rects.map((r) => ({
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    })),
    confidence,
    opacity: style.opacity,
    borderOpacity: style.borderOpacity,
    zIndex: style.zIndex,
    overlayLabel: labelForTier(tier),
    sourceMemberId,
    text: resolveMemberText(neighborhood, sourceMemberId),
  };
}

function resolveMemberText(
  neighborhood: HighlightNeighborhood,
  memberId: string
): string | undefined {
  if (neighborhood.anchor?.id === memberId) return neighborhood.anchor.text;
  const support = (neighborhood.support ?? []).find((s) => s.id === memberId);
  if (support) return support.text;
  const additional = (neighborhood.additional ?? []).find((a) => a.id === memberId);
  if (additional) return additional.text;
  if (neighborhood.trap?.id === memberId) return neighborhood.trap.text;
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*                                 STYLING                                    */
/* -------------------------------------------------------------------------- */

function styleForTierAndConfidence(
  tier: GuidedTier,
  confidence: MatchConfidence,
  displayMode: HighlightOverlayRect["displayMode"]
): {
  opacity: number;
  borderOpacity: number;
  zIndex: number;
} {
  const base = baseTierStyle(tier);
  const confidenceMultiplier = confidenceWeight(confidence) * displayModeWeight(displayMode);

  return {
    opacity: round2(base.opacity * confidenceMultiplier),
    borderOpacity: round2(base.borderOpacity * confidenceMultiplier),
    zIndex: base.zIndex,
  };
}

function baseTierStyle(tier: GuidedTier): {
  opacity: number;
  borderOpacity: number;
  zIndex: number;
} {
  switch (tier) {
    case "main_signal":
      return { opacity: 0.34, borderOpacity: 0.55, zIndex: 40 };
    case "explains_it":
      return { opacity: 0.26, borderOpacity: 0.42, zIndex: 30 };
    case "extra_context":
      return { opacity: 0.18, borderOpacity: 0.28, zIndex: 20 };
    case "do_not_confuse":
      return { opacity: 0.28, borderOpacity: 0.5, zIndex: 35 };
    default:
      return { opacity: 0.2, borderOpacity: 0.3, zIndex: 10 };
  }
}

function confidenceWeight(confidence: MatchConfidence): number {
  switch (confidence) {
    case "exact":
      return 1;
    case "strong":
      return 0.94;
    case "approximate":
      return 0.82;
    case "weak":
      return 0.68;
    case "none":
    default:
      return 0;
  }
}

function displayModeWeight(mode: HighlightOverlayRect["displayMode"]): number {
  switch (mode) {
    case "full":
      return 1;
    case "reduced":
      return 0.9;
    case "minimal":
      return 0.76;
    case "hidden":
    default:
      return 0;
  }
}

function labelForTier(
  tier: GuidedTier
): GuidedNeighborhoodOverlayEntry["overlayLabel"] {
  switch (tier) {
    case "main_signal":
      return "Main Signal";
    case "explains_it":
      return "Explains It";
    case "extra_context":
      return "Extra Context";
    case "do_not_confuse":
      return "Do Not Confuse";
    default:
      return "Extra Context";
  }
}

/* -------------------------------------------------------------------------- */
/*                                   ORDERING                                 */
/* -------------------------------------------------------------------------- */

function inferNeighborhoodPageOrder(
  entries: GuidedNeighborhoodOverlayEntry[]
): number {
  const firstRect = entries
    .flatMap((entry) => entry.rects)
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))[0];

  if (!firstRect) return Number.MAX_SAFE_INTEGER;

  return Math.round(firstRect.y * 10000 + firstRect.x);
}

function sortEntriesWithinNeighborhood(
  entries: GuidedNeighborhoodOverlayEntry[]
): GuidedNeighborhoodOverlayEntry[] {
  return [...entries].sort((a, b) => {
    const tierRankA = tierRank(a.tier);
    const tierRankB = tierRank(b.tier);
    if (tierRankA !== tierRankB) return tierRankA - tierRankB;

    if (a.order !== b.order) return a.order - b.order;

    const aFirst = a.rects[0];
    const bFirst = b.rects[0];
    if (!aFirst || !bFirst) return 0;

    if (aFirst.y !== bFirst.y) return aFirst.y - bFirst.y;
    return aFirst.x - bFirst.x;
  });
}

function tierRank(tier: GuidedTier): number {
  switch (tier) {
    case "main_signal":
      return 1;
    case "explains_it":
      return 2;
    case "extra_context":
      return 3;
    case "do_not_confuse":
      return 4;
    default:
      return 5;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
