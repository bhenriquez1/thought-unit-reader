// lib/highlights/buildGuidedLegend.ts
//
// Dynamic legend builder.
// Single source of truth:
// - guided reading path
// - overlay tiers
// - badge sequence
//
// Goal:
// The legend must always reflect what is ACTUALLY present on the current page.
// No stale hardcoded legend entries.

import type { RenderGuidedReadingPathResult } from "./renderGuidedReadingPath";

export type GuidedLegendTier =
  | "main_signal"
  | "explains_it"
  | "extra_context"
  | "do_not_confuse";

export interface GuidedLegendEntry {
  id: string;
  tier: GuidedLegendTier;
  badge: string;
  label: string;
  description: string;
  order: number;
  color: string;
  borderColor: string;
  textColor: string;
  isPresent: boolean;
  memberCount: number;
}

export interface BuildGuidedLegendInput {
  guidedPath: RenderGuidedReadingPathResult | null | undefined;
}

export interface BuildGuidedLegendResult {
  entries: GuidedLegendEntry[];
}

/**
 * Build a current-page legend directly from the guided reading path output.
 *
 * Rules:
 * - only include tiers actually present on the current page
 * - keep order aligned with reading semantics
 * - keep colors synchronized with overlay rendering
 * - never depend on static legend state
 */
export function buildGuidedLegend(
  input: BuildGuidedLegendInput
): BuildGuidedLegendResult {
  const guidedPath = input.guidedPath;
  if (!guidedPath?.flatOverlays?.length) {
    return { entries: [] };
  }

  const tierCounts = countTiers(guidedPath);

  const orderedTiers: GuidedLegendTier[] = [
    "main_signal",
    "explains_it",
    "extra_context",
    "do_not_confuse",
  ];

  const entries: GuidedLegendEntry[] = orderedTiers
    .filter((tier) => (tierCounts.get(tier) ?? 0) > 0)
    .map((tier) => {
      const meta = legendMetaForTier(tier);
      return {
        id: `legend:${tier}`,
        tier,
        badge: meta.badge,
        label: meta.label,
        description: meta.description,
        order: meta.order,
        color: meta.color,
        borderColor: meta.borderColor,
        textColor: meta.textColor,
        isPresent: true,
        memberCount: tierCounts.get(tier) ?? 0,
      };
    })
    .sort((a, b) => a.order - b.order);

  return { entries };
}

function countTiers(guidedPath: RenderGuidedReadingPathResult): Map<GuidedLegendTier, number> {
  const counts = new Map<GuidedLegendTier, number>();
  for (const overlay of guidedPath.flatOverlays) {
    const tier = overlay.tier as GuidedLegendTier;
    counts.set(tier, (counts.get(tier) ?? 0) + 1);
  }
  return counts;
}

function legendMetaForTier(tier: GuidedLegendTier): {
  badge: string;
  label: string;
  description: string;
  order: number;
  color: string;
  borderColor: string;
  textColor: string;
} {
  switch (tier) {
    case "main_signal":
      return {
        badge: "1",
        label: "Main Signal",
        description: "Start here",
        order: 1,
        color: "rgba(234, 179, 8, 0.42)",
        borderColor: "rgba(245, 200, 66, 0.72)",
        textColor: "#fde68a",
      };
    case "explains_it":
      return {
        badge: "2",
        label: "Explains It",
        description: "Then read this",
        order: 2,
        color: "rgba(96, 165, 250, 0.34)",
        borderColor: "rgba(147, 197, 253, 0.58)",
        textColor: "#bfdbfe",
      };
    case "extra_context":
      return {
        badge: "3",
        label: "Extra Context",
        description: "Then deepen",
        order: 3,
        color: "rgba(226, 232, 240, 0.22)",
        borderColor: "rgba(203, 213, 225, 0.38)",
        textColor: "#e2e8f0",
      };
    case "do_not_confuse":
      return {
        badge: "!",
        label: "Do Not Confuse",
        description: "Final check",
        order: 4,
        color: "rgba(244, 114, 182, 0.34)",
        borderColor: "rgba(251, 146, 203, 0.64)",
        textColor: "#f9a8d4",
      };
  }
}
