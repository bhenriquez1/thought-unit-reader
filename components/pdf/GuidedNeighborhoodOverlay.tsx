// components/pdf/GuidedNeighborhoodOverlay.tsx
// Neighborhood-aware, inline-style highlight renderer.
// Renders true highlight fills (not underline-style) in page reading order.
// Main Signal → Explains It → Extra Context → Do Not Confuse
// Numbered reading-path badges are placed on the first rect of each guided step.
"use client";

import React, { useEffect, useMemo } from "react";
import type { HighlightNeighborhood } from "@/lib/highlights/buildHighlightNeighborhoods";
import type { HighlightOverlayRect } from "@/lib/highlights/buildHighlightRects";
import type { GuidedNeighborhoodOverlayEntry, GuidedTier } from "@/lib/highlights/renderGuidedNeighborhoodOverlays";
import { renderGuidedReadingPath, type RenderGuidedReadingPathResult } from "@/lib/highlights/renderGuidedReadingPath";
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

const BADGE_BG: Record<GuidedTier, string> = {
  main_signal:    "rgba(161, 98, 7, 0.95)",
  explains_it:    "rgba(37, 99, 235, 0.95)",
  extra_context:  "rgba(71, 85, 105, 0.95)",
  do_not_confuse: "rgba(190, 24, 93, 0.95)",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface GuidedNeighborhoodOverlayProps {
  neighborhoods: HighlightNeighborhood[];
  overlayRects: HighlightOverlayRect[];
  visible?: boolean;
  onOverlayClick?: (payload: { neighborhoodId: string; memberId?: string; tier: GuidedTier; text?: string }) => void;
  onReadingPath?: (path: RenderGuidedReadingPathResult | null) => void;
  /** Maps conceptId → short role label ("Core", "Why", "How", "More") for badge role pills. */
  roleLabelByConceptId?: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GuidedNeighborhoodOverlay({
  neighborhoods,
  overlayRects,
  visible = true,
  onOverlayClick,
  onReadingPath,
  roleLabelByConceptId,
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

  // Bubble the reading path result up so parent can build a dynamic legend.
  useEffect(() => {
    onReadingPath?.(guided);
  }, [guided, onReadingPath]);

  // One badge per neighborhood — the anchor (main_signal) carries a sequential number,
  // the trap (do_not_confuse) carries "!". Support/additional overlays are highlighted
  // but carry no badge, keeping the left panel uncluttered. Total capped at 5 badges.
  const badgeEntries = useMemo(() => {
    if (!guided) return [];
    const entries: Array<{
      id: string;
      label: string;
      x: number;
      y: number;
      tier: GuidedTier;
      roleLabel: string;
      tooltip: string;
    }> = [];
    let counter = 1;
    for (const neighborhood of guided.neighborhoods) {
      if (entries.length >= 5) break; // hard cap: max 5 badges per page
      const sourceNeighborhood = neighborhoods.find((n) => n.id === neighborhood.neighborhoodId);
      const roleLabel =
        conceptRoleLabel(sourceNeighborhood?.conceptRole) ||
        roleLabelByConceptId?.get(neighborhood.conceptId ?? "") ||
        "";
      const supportText = sourceNeighborhood?.support?.[0]?.text ?? "";

      // Only anchor (main_signal) and trap (do_not_confuse) earn a badge.
      // Support/additional highlights are colored but unlabeled — reduces clutter
      // so the numbered path stays readable: 1 → 2 → 3 → 4 (→ !).
      const anchorOverlay = neighborhood.overlays.find((o) => o.tier === "main_signal");
      const trapOverlay   = neighborhood.overlays.find((o) => o.tier === "do_not_confuse");

      if (anchorOverlay?.rects[0]) {
        const firstRect = anchorOverlay.rects[0];
        const tooltipSupport = supportText
          ? `\n${supportText.length > 100 ? supportText.slice(0, 97) + "…" : supportText}`
          : "";
        entries.push({
          id: `${anchorOverlay.id}:badge`,
          label: String(counter++),
          x: firstRect.x,
          y: firstRect.y,
          tier: "main_signal",
          roleLabel,
          tooltip: `${roleLabel || "Key concept"}${tooltipSupport}`,
        });
      }

      if (trapOverlay?.rects[0] && entries.length < 5) {
        entries.push({
          id: `${trapOverlay.id}:badge`,
          label: "!",
          x: trapOverlay.rects[0].x,
          y: trapOverlay.rects[0].y,
          tier: "do_not_confuse",
          roleLabel: "Trap",
          tooltip: "Do not confuse",
        });
      }
    }
    return entries;
  }, [guided, roleLabelByConceptId, neighborhoods]);

  if (!visible || !guided?.flatOverlays.length) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden="true"
    >
      {/* Highlight fills */}
      {guided.neighborhoods.map((group) => (
        <React.Fragment key={group.neighborhoodId}>
          {group.overlays.map((entry) => {
            const style = TIER_STYLE[entry.tier];
            const eduTier = (entry.educationalTier ?? 4) as 1|2|3|4;
            // Tier 1 (theorem/formula): stronger ring + glow shadow; tier 4: minimal ring
            const borderWidth = entry.tier === "main_signal" && eduTier === 1 ? "2px" : "1px";
            const boxShadow =
              entry.tier === "main_signal" && eduTier === 1
                ? "0 0 0 2px rgba(245,200,66,0.45), 0 0 8px rgba(245,200,66,0.18)"
                : entry.tier === "main_signal" && eduTier === 2
                ? "0 0 0 1px rgba(245,200,66,0.32)"
                : entry.tier === "do_not_confuse"
                ? "0 0 0 1px rgba(251,146,203,0.35), 0 0 6px rgba(244,114,182,0.14)"
                : style.boxShadow;
            const borderRadius = entry.tier === "main_signal" ? (eduTier === 1 ? 5 : 4) : 3;
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
                  border: `${borderWidth} solid ${style.border}`,
                  boxShadow,
                  borderRadius,
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

      {/* Numbered reading-path badges with optional role label pill */}
      {badgeEntries.map((badge) => (
        <div
          key={badge.id}
          title={badge.tooltip || undefined}
          style={{
            position: "absolute",
            left: Math.max(4, badge.x - 24),
            top: badge.roleLabel ? badge.y - 22 : badge.y - 18,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            zIndex: 80,
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              color: "white",
              background: BADGE_BG[badge.tier],
              boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
            }}
          >
            {badge.label}
          </div>
          {badge.roleLabel && (
            <div
              style={{
                fontSize: 7,
                fontWeight: 700,
                color: "white",
                background: BADGE_BG[badge.tier],
                borderRadius: 3,
                padding: "0px 3px",
                lineHeight: "11px",
                letterSpacing: "0.03em",
                boxShadow: "0 1px 3px rgba(0,0,0,0.28)",
                whiteSpace: "nowrap",
              }}
            >
              {badge.roleLabel}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function conceptRoleLabel(role?: string): string {
  switch (role) {
    case "theorem":        return "Theorem";
    case "formula":        return "Formula";
    case "definition":     return "Define";
    case "mechanism":      return "How";
    case "contrast":       return "Trap";
    case "application":    return "Apply";
    case "worked_example": return "Example";
    case "measurement":    return "Rule";
    case "variation":      return "Contrast";
    case "analogy":        return "Analogy";
    case "example":        return "Example";
    default:               return "";
  }
}

function conceptRoleToEducationalTier(role?: string): 1 | 2 | 3 | 4 {
  if (role === "theorem" || role === "formula") return 1;
  if (role === "definition" || role === "mechanism" || role === "contrast") return 2;
  if (role === "application" || role === "worked_example") return 3;
  return 4;
}

function materializeEntries(
  n: HighlightNeighborhood,
  byMemberId: Map<string, HighlightOverlayRect>
): GuidedNeighborhoodOverlayEntry[] {
  const entries: GuidedNeighborhoodOverlayEntry[] = [];
  let order = 0;
  const educationalTier = conceptRoleToEducationalTier(n.conceptRole);

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
      opacity: tunedOpacity(tier, overlay.displayMode, educationalTier),
      borderOpacity: tunedBorderOpacity(tier, overlay.displayMode, educationalTier),
      zIndex: zIndexForTier(tier, educationalTier),
      overlayLabel: labelForTier(tier),
      sourceMemberId: memberId,
      text,
      educationalTier,
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

// Educational weight multipliers: tier 1 (theorem/formula) = strongest glow,
// tier 4 (detail/narrative) = faint background annotation.
const EDU_OPACITY_WEIGHT:  Record<1|2|3|4, number> = { 1: 1.32, 2: 1.0, 3: 0.68, 4: 0.42 };
const EDU_BORDER_WEIGHT:   Record<1|2|3|4, number> = { 1: 1.22, 2: 1.0, 3: 0.75, 4: 0.48 };

function tunedOpacity(tier: GuidedTier, mode: HighlightOverlayRect["displayMode"], educationalTier: 1|2|3|4 = 4): number {
  const base = tier === "main_signal" ? 0.50 : tier === "explains_it" ? 0.38 : tier === "extra_context" ? 0.26 : 0.44;
  const mult = mode === "full" ? 1 : mode === "reduced" ? 0.9 : mode === "minimal" ? 0.78 : 0;
  return clamp(base * EDU_OPACITY_WEIGHT[educationalTier] * mult, 0, 0.74);
}

function tunedBorderOpacity(tier: GuidedTier, mode: HighlightOverlayRect["displayMode"], educationalTier: 1|2|3|4 = 4): number {
  const base = tier === "main_signal" ? 0.78 : tier === "explains_it" ? 0.60 : tier === "extra_context" ? 0.40 : 0.70;
  const mult = mode === "full" ? 1 : mode === "reduced" ? 0.9 : mode === "minimal" ? 0.8 : 0;
  return clamp(base * EDU_BORDER_WEIGHT[educationalTier] * mult, 0, 0.95);
}

function zIndexForTier(tier: GuidedTier, educationalTier: 1|2|3|4 = 4): number {
  const base = tier === "main_signal" ? 50 : tier === "do_not_confuse" ? 45 : tier === "explains_it" ? 40 : 35;
  // Tier 1 floats above tier 4 when overlapping
  return base + (4 - educationalTier);
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
