"use client";

// components/reader/ThoughtRoadmap.tsx
//
// Level 4 of the LeftPanel evolution: a vertical "expert mental model" of
// the current page — one representative node per Level 3 group, in the
// preset's own group order (e.g. DAT: Concept ↓ Mechanism ↓ Application ↓
// Trap ↓ High-Yield Fact). Uses the exact same groupThoughtUnits() output as
// ThoughtUnitNavigator, so the roadmap and the full list never disagree
// about sectioning — this is a summary view of the same data, not a new
// extraction pass.

import React, { useMemo } from "react";
import type { ThoughtUnitNavigatorEntry } from "./ThoughtUnitNavigator";
import { KIND_COLORS, FALLBACK_COLOR } from "./ThoughtUnitNavigator";
import { getKindLabel, groupThoughtUnits } from "@/lib/insights/domainPresets";
import { getImportanceTier, renderStars } from "@/lib/insights/importanceTiers";
import type { ParagraphKind } from "@/lib/readerContracts";

export default function ThoughtRoadmap({
  entries,
  focusedId,
  onJump,
  presetId = "universal",
}: {
  entries: ThoughtUnitNavigatorEntry[];
  focusedId?: string | null;
  onJump: (id: string) => void;
  presetId?: string;
}) {
  const nodes = useMemo(() => {
    const groups = groupThoughtUnits(entries, presetId);
    const totalItems = groups.reduce((sum, g) => sum + g.items.length, 0);
    return groups
      .map((g, groupIndex) => ({
        id: g.id,
        label: g.label ?? getKindLabel(presetId, g.representativeKind as ParagraphKind),
        representativeKind: g.representativeKind,
        // Highest-confidence item stands in for the whole group; first item when no scores are present.
        top: [...g.items].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0],
        count: g.items.length,
        // Groups arrive in the preset's own expert-priority order, so ordinal
        // position doubles as a "decision point" importance tier.
        tier: getImportanceTier(groupIndex),
        // Share of this page's thought units this category represents — a heuristic
        // stand-in for "how much of today's understanding rides on this", not a
        // measured statistic.
        impactPct: totalItems > 0 ? Math.round((g.items.length / totalItems) * 100) : 0,
      }))
      .filter((n) => n.top);
  }, [entries, presetId]);

  if (nodes.length < 2) return null;

  return (
    <div className="flex flex-col gap-1.5" data-testid="thought-roadmap">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 px-1">
        Page Roadmap
      </span>
      <div className="flex flex-col gap-1 px-1">
        {nodes.map((node, i) => {
          const colors = KIND_COLORS[node.representativeKind] ?? FALLBACK_COLOR;
          const focused = node.top.id === focusedId;
          return (
            <React.Fragment key={node.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => onJump(node.top.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump(node.top.id); }}
                className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors w-full"
                style={{
                  background: focused ? colors.bg.replace("0.12", "0.28") : colors.bg,
                  border: `1px solid ${colors.color}${focused ? "88" : "33"}`,
                }}
                data-testid="thought-roadmap-node"
                title={node.top.text}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[8px] font-bold uppercase tracking-wide text-white/40">
                    Decision Point {i + 1}
                  </span>
                  <span
                    className="text-[8px] tracking-tighter shrink-0"
                    style={{ color: colors.color }}
                    title={`${node.tier.label} priority`}
                    data-testid="importance-stars"
                  >
                    {renderStars(node.tier.stars)}
                  </span>
                </div>
                <span
                  className="text-[8.5px] font-bold uppercase tracking-wide truncate"
                  style={{ color: colors.color }}
                >
                  {node.label}{node.count > 1 ? ` (${node.count})` : ""}
                </span>
                <span
                  className="text-[9.5px] leading-snug text-white/75"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  {node.top.text}
                </span>
                {i === 0 && (
                  <div
                    className="mt-0.5 flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[8px] font-bold"
                    style={{ background: `${colors.color}22`, color: colors.color }}
                    data-testid="thought-roadmap-master-badge"
                  >
                    <span>🎯 MASTER THIS</span>
                    <span className="text-white/50 font-normal normal-case">
                      · est. impact {node.impactPct}%
                    </span>
                  </div>
                )}
              </div>
              {i < nodes.length - 1 && (
                <span className="self-center text-white/25 text-[12px] shrink-0">↓</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
