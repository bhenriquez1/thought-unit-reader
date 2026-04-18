// components/pdf/GuidedNeighborhoodOverlay.tsx
// Neighborhood-aware, inline-style highlight renderer.
// Renders true highlight fills (not underline-style) in page reading order.
// Main Signal → Explains It → Extra Context → Do Not Confuse
"use client";

import React, { useMemo } from "react";
import type { HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";
import type { HighlightOverlayRect } from "@/lib/highlights/buildHighlightRects";
import type { GuidedNeighborhoodOverlayEntry, GuidedTier } from "@/lib/highlights/renderGuidedNeighborhoodOverlays";
import { renderGuidedReadingPath } from "@/lib/highlights/renderGuidedReadingPath";
import type { MatchConfidence } from "@/lib/highlights/matchNeighborhoodMemberToText";

// ---------------------------------------------------------------------------
// Color constants — actual RGBA fills, not Tailwind opacity classes
// ---------------------------------------------------------------------------
const TIER_STYLE: Record<GuidedTier, { background: string; border: string; boxShadow: string }> = {
  main_signal: {
    background: "rgba(234, 179, 8, 0.42)",
    border: "rgba(245, 200, 66, 0.72)",
    boxShadow: "0 0 0 1px rgba(245, 200, 66, 0.22)",
  },
  explains_it: {
    background: "rgba(96, 165, 250, 0.34)",
    border: "rgba(147, 197, 253, 0.58)",
    boxShadow: "0 0 0 1px rgba(147, 197, 253, 0.16)",
  },
  extra_context: {
    background: "rgba(226, 232, 240, 0.22)",
    border: "rgba(203, 213, 225, 0.38)",
    boxShadow: "0 0 0 1px rgba(203, 213, 225, 0.08)",
  },
  do_not_confuse: {
    background: "rgba(244, 114, 182, 0.38)",
    border: "rgba(251, 146, 203, 0.64)",
    boxShadow: "0 0 0 1px rgba(251, 146, 203, 0.18)",
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface GuidedNeighborhoodOverlayProps {
  neighborhoods: HighlightNeighborhood[];
  overlayRects: HighlightOverlayRect[];
  visible?: boolean;
  onOverlayClick?: (payload: { neighborhoodId: string; memberId?: string; tier: GuidedTier; text?: string }) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GuidedNeighborhoodOverlay({
  neighborhoods,
  overlayRects,
  visible = true,
  onOverlayClick,
}: GuidedNeighborhoodOverlayProps) {
  const guided = useMemo(() => {
    if (!neighborhoods.length || !overlayRects.length) return null;

    const byMemberId = new Map<string, HighlightOverlayRect>();
    for (const o of overlayRects) byMemberId.set(o.memberId, o);

    const neighborhoodModels = neighborhoods
      .map((n) => ({
        neighborhoodId: n.id,
        conceptId: n.conceptId,
        title: n.title,
        pageOrder: inferNeighborhoodPageOrder(n, byMemberId),
        overlays: materializeEntries(n, byMemberId),
      }))
      .filter((m) => m.overlays.length > 0)
      .sort((a, b) => a.pageOrder - b.pageOrder);

    if (!neighborhoodModels.length) return null;

    return renderGuidedReadingPath({
      neighborhoods: neighborhoodModels,
      showBadges: false,
      showConnectors: false,
    });
  }, [neighborhoods, overlayRects]);

  if (!visible || !guided?.flatOverlays.length) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden="true"
    >
      {guided.neighborhoods.map((group) => (
        <React.Fragment key={group.neighborhoodId}>
          {group.overlays.map((entry) => {
            const style = TIER_STYLE[entry.tier];
            return entry.rects.map((rect, ri) => (
              <button
                key={`${entry.id}-${ri}`}
                type="button"
                onClick={
                  onOverlayClick
                    ? () => onOverlayClick({ neighborhoodId: entry.neighborhoodId, memberId: entry.sourceMemberId, tier: entry.tier, text: entry.text })
                    : undefined
                }
                title={entry.overlayLabel}
                style={{
                  position: "absolute",
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  background: style.background,
                  border: `1px solid ${style.border}`,
                  boxShadow: style.boxShadow,
                  borderRadius: entry.tier === "main_signal" ? 4 : 3,
                  opacity: entry.opacity,
                  pointerEvents: onOverlayClick ? "auto" : "none",
                  cursor: onOverlayClick ? "pointer" : "default",
                  zIndex: entry.zIndex,
                  padding: 0,
                }}
              />
            ));
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function materializeEntries(
  n: HighlightNeighborhood,
  byMemberId: Map<string, HighlightOverlayRect>
): GuidedNeighborhoodOverlayEntry[] {
  const entries: GuidedNeighborhoodOverlayEntry[] = [];
  let order = 0;

  const push = (memberId: string | undefined, tier: GuidedTier, text?: string) => {
    if (!memberId) return;
    const overlay = byMemberId.get(memberId);
    if (!overlay?.rects?.length || overlay.displayMode === "hidden") return;
    entries.push({
      id: `${n.id}:${memberId}:${tier}`,
      neighborhoodId: n.id,
      conceptId: n.conceptId,
      title: n.title,
      order: order++,
      tier,
      rects: overlay.rects,
      confidence: overlay.confidence as MatchConfidence,
      opacity: tunedOpacity(tier, overlay.displayMode),
      borderOpacity: tunedBorderOpacity(tier, overlay.displayMode),
      zIndex: zIndexForTier(tier),
      overlayLabel: labelForTier(tier),
      sourceMemberId: memberId,
      text,
    });
  };

  push(n.anchor?.id, "main_signal", n.anchor?.text);
  for (const s of n.support ?? []) push(s.id, "explains_it", s.text);
  for (const a of n.additional ?? []) push(a.id, "extra_context", a.text);
  if (n.trap) push(n.trap.id, "do_not_confuse", n.trap.text);

  return entries;
}

function inferNeighborhoodPageOrder(
  n: HighlightNeighborhood,
  byMemberId: Map<string, HighlightOverlayRect>
): number {
  const allRects = [n.anchor, ...(n.support ?? []), ...(n.additional ?? []), n.trap]
    .filter(Boolean)
    .flatMap((m) => byMemberId.get(m!.id)?.rects ?? []);

  const first = allRects.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)[0];
  return first ? Math.round(first.y * 10000 + first.x) : Number.MAX_SAFE_INTEGER;
}

function tunedOpacity(tier: GuidedTier, mode: HighlightOverlayRect["displayMode"]): number {
  const base = tier === "main_signal" ? 0.5 : tier === "explains_it" ? 0.38 : tier === "extra_context" ? 0.26 : 0.44;
  const mult = mode === "full" ? 1 : mode === "reduced" ? 0.9 : mode === "minimal" ? 0.78 : 0;
  return clamp(base * mult, 0, 0.64);
}

function tunedBorderOpacity(tier: GuidedTier, mode: HighlightOverlayRect["displayMode"]): number {
  const base = tier === "main_signal" ? 0.78 : tier === "explains_it" ? 0.60 : tier === "extra_context" ? 0.40 : 0.70;
  const mult = mode === "full" ? 1 : mode === "reduced" ? 0.9 : mode === "minimal" ? 0.8 : 0;
  return clamp(base * mult, 0, 0.9);
}

function zIndexForTier(tier: GuidedTier): number {
  switch (tier) {
    case "main_signal":    return 50;
    case "do_not_confuse": return 45;
    case "explains_it":    return 40;
    case "extra_context":  return 35;
    default:               return 30;
  }
}

function labelForTier(tier: GuidedTier): GuidedNeighborhoodOverlayEntry["overlayLabel"] {
  switch (tier) {
    case "main_signal":    return "Main Signal";
    case "explains_it":    return "Explains It";
    case "extra_context":  return "Extra Context";
    case "do_not_confuse": return "Do Not Confuse";
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
