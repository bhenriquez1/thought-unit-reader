// lib/highlights/renderGuidedReadingPath.ts

import type { GuidedNeighborhoodRenderModel, GuidedNeighborhoodOverlayEntry, GuidedTier } from "./renderGuidedNeighborhoodOverlays";

export interface ReadingPathBadge {
  text: "1" | "2" | "3" | "!";
  x: number;
  y: number;
  tier: GuidedTier;
}

export interface ReadingPathConnector {
  from: { x: number; y: number };
  to: { x: number; y: number };
  tier: GuidedTier;
  kind: "sequence" | "support" | "warning";
}

export interface GuidedReadingPathOverlay extends GuidedNeighborhoodOverlayEntry {
  readingOrder: number;
  emphasis: "primary" | "secondary" | "tertiary" | "warning";
  badge?: ReadingPathBadge;
}

export interface GuidedReadingPathModel {
  neighborhoodId: string;
  conceptId?: string;
  title?: string;
  pageOrder: number;
  overlays: GuidedReadingPathOverlay[];
  connectors: ReadingPathConnector[];
}

export interface RenderGuidedReadingPathInput {
  neighborhoods: GuidedNeighborhoodRenderModel[];
  showBadges?: boolean;
  showConnectors?: boolean;
}

export interface RenderGuidedReadingPathResult {
  neighborhoods: GuidedReadingPathModel[];
  flatOverlays: GuidedReadingPathOverlay[];
  connectors: ReadingPathConnector[];
}

/**
 * Converts guided neighborhood overlays into a stronger visual reading path.
 *
 * Goals:
 * - preserve neighborhood grouping
 * - enforce order: Main Signal -> Explains It -> Extra Context -> Do Not Confuse
 * - make the page feel like "read here first, then here"
 * - remain subtle enough for textbook reading
 */
export function renderGuidedReadingPath(
  input: RenderGuidedReadingPathInput
): RenderGuidedReadingPathResult {
  const showBadges = input.showBadges ?? true;
  const showConnectors = input.showConnectors ?? true;

  const neighborhoods: GuidedReadingPathModel[] = input.neighborhoods
    .map((n, neighborhoodIndex) => {
      const overlays = n.overlays
        .slice()
        .sort(byOverlayOrder)
        .map((overlay, overlayIndex) =>
          materializeReadingOverlay(
            overlay,
            neighborhoodIndex,
            overlayIndex,
            showBadges
          )
        );

      const connectors = showConnectors
        ? buildNeighborhoodConnectors(overlays)
        : [];

      return {
        neighborhoodId: n.neighborhoodId,
        conceptId: n.conceptId,
        title: n.title,
        pageOrder: n.pageOrder,
        overlays,
        connectors,
      };
    })
    .sort((a, b) => a.pageOrder - b.pageOrder);

  return {
    neighborhoods,
    flatOverlays: neighborhoods.flatMap((n) => n.overlays),
    connectors: neighborhoods.flatMap((n) => n.connectors),
  };
}

function materializeReadingOverlay(
  overlay: GuidedNeighborhoodOverlayEntry,
  neighborhoodIndex: number,
  overlayIndex: number,
  showBadge: boolean
): GuidedReadingPathOverlay {
  const firstRect = overlay.rects[0];
  const readingOrder = neighborhoodIndex * 10 + overlayIndex + 1;
  const emphasis = emphasisForTier(overlay.tier);

  const badge =
    showBadge && firstRect
      ? buildBadgeForTier(overlay.tier, firstRect.x, firstRect.y)
      : undefined;

  return {
    ...overlay,
    readingOrder,
    emphasis,
    badge,
    opacity: tunedOpacity(overlay.tier, overlay.opacity),
    borderOpacity: tunedBorderOpacity(overlay.tier, overlay.borderOpacity),
  };
}

function buildNeighborhoodConnectors(
  overlays: GuidedReadingPathOverlay[]
): ReadingPathConnector[] {
  const connectors: ReadingPathConnector[] = [];
  if (overlays.length <= 1) return connectors;

  for (let i = 0; i < overlays.length - 1; i += 1) {
    const current = overlays[i];
    const next = overlays[i + 1];
    const from = rectCenter(current.rects[0]);
    const to = rectCenter(next.rects[0]);
    if (!from || !to) continue;

    connectors.push({
      from,
      to,
      tier: next.tier,
      kind: connectorKindForTier(next.tier),
    });
  }

  return connectors;
}

function connectorKindForTier(tier: GuidedTier): ReadingPathConnector["kind"] {
  switch (tier) {
    case "explains_it":
      return "support";
    case "do_not_confuse":
      return "warning";
    default:
      return "sequence";
  }
}

function emphasisForTier(
  tier: GuidedTier
): GuidedReadingPathOverlay["emphasis"] {
  switch (tier) {
    case "main_signal":
      return "primary";
    case "explains_it":
      return "secondary";
    case "extra_context":
      return "tertiary";
    case "do_not_confuse":
      return "warning";
  }
}

function buildBadgeForTier(
  tier: GuidedTier,
  x: number,
  y: number
): ReadingPathBadge {
  switch (tier) {
    case "main_signal":
      return { text: "1", x, y, tier };
    case "explains_it":
      return { text: "2", x, y, tier };
    case "extra_context":
      return { text: "3", x, y, tier };
    case "do_not_confuse":
      return { text: "!", x, y, tier };
  }
}

function tunedOpacity(tier: GuidedTier, base: number): number {
  switch (tier) {
    case "main_signal":
      return clamp(base + 0.08, 0.34, 0.56);
    case "explains_it":
      return clamp(base + 0.06, 0.26, 0.42);
    case "extra_context":
      return clamp(base + 0.04, 0.18, 0.32);
    case "do_not_confuse":
      return clamp(base + 0.07, 0.3, 0.48);
  }
}

function tunedBorderOpacity(tier: GuidedTier, base: number): number {
  switch (tier) {
    case "main_signal":
      return clamp(base + 0.08, 0.45, 0.7);
    case "explains_it":
      return clamp(base + 0.06, 0.34, 0.58);
    case "extra_context":
      return clamp(base + 0.03, 0.22, 0.42);
    case "do_not_confuse":
      return clamp(base + 0.08, 0.42, 0.7);
  }
}

function byOverlayOrder(
  a: GuidedNeighborhoodOverlayEntry,
  b: GuidedNeighborhoodOverlayEntry
): number {
  if (a.order !== b.order) return a.order - b.order;
  const ay = a.rects[0]?.y ?? 0;
  const by = b.rects[0]?.y ?? 0;
  if (ay !== by) return ay - by;
  const ax = a.rects[0]?.x ?? 0;
  const bx = b.rects[0]?.x ?? 0;
  return ax - bx;
}

function rectCenter(
  rect?: { x: number; y: number; width: number; height: number }
): { x: number; y: number } | null {
  if (!rect) return null;
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
