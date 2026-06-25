"use client";

// components/reader/ThoughtUnitNavigator.tsx
//
// Level 2 of the LeftPanel evolution: a clickable list of the current page's
// thought units (grouped by kind), instead of just colored highlight rects.
// Reuses the same evidenceRefId-based focus mechanism that PDF-overlay clicks
// already use (pages/index.tsx's onEvidenceFocus/onPdfHighlightFocus), so
// clicking an entry here jumps to the PDF, glows the highlight, and starts
// speech from that thought unit exactly like clicking the highlight itself
// — no separate "play" plumbing needed. The "Explain" button is the one new
// hook, wired to pages/index.tsx's openExplainStepForThoughtUnit.

import React, { useMemo, useState } from "react";
import type { ParagraphKind } from "@/lib/readerContracts";
import { getKindLabel, groupThoughtUnits } from "@/lib/insights/domainPresets";
import DomainModeSelector from "./DomainModeSelector";

export interface ThoughtUnitNavigatorEntry {
  id: string;
  text: string;
  kind: ParagraphKind;
  /** Source page — not rendered yet, carried through so future UI (e.g. cross-page search) doesn't need a data-shape change. */
  page?: number;
  /** Anchor score/confidence, when the pipeline provides one. */
  confidence?: number;
}

// Colors stay constant across domain presets — only the label text changes
// (via getKindLabel) — so the navigator's visual identity doesn't shift
// every time the detected/overridden preset changes. Exported so the Level 4
// page roadmap (ThoughtRoadmap) renders the same groups in matching colors.
export const KIND_COLORS: Record<string, { color: string; bg: string }> = {
  thesis:      { color: "#fde047", bg: "rgba(253,224,71,0.12)" },
  definition:  { color: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
  mechanism:   { color: "#86efac", bg: "rgba(134,239,172,0.12)" },
  application: { color: "#c084fc", bg: "rgba(192,132,252,0.12)" },
  trap:        { color: "#fca5a5", bg: "rgba(252,165,165,0.12)" },
  clinical:    { color: "#fda4af", bg: "rgba(253,164,175,0.12)" },
  formula:     { color: "#7dd3fc", bg: "rgba(125,211,252,0.12)" },
  dat_fact:    { color: "#fed7aa", bg: "rgba(251,146,60,0.12)" },
};
export const FALLBACK_COLOR = { color: "#cbd5e1", bg: "rgba(203,213,225,0.10)" };

export default function ThoughtUnitNavigator({
  entries,
  focusedId,
  onJump,
  onExplain,
  onOpenRecall,
  onOpenNote,
  presetId = "universal",
  detectedPresetLabel,
  overridePresetId,
  onPresetChange,
}: {
  entries: ThoughtUnitNavigatorEntry[];
  focusedId?: string | null;
  onJump: (id: string) => void;
  onExplain?: (id: string) => void;
  /** Seeds a Recall Lab review session from this thought unit. */
  onOpenRecall?: (id: string) => void;
  /** Seeds a NoteLab note from this thought unit. */
  onOpenNote?: (id: string) => void;
  /** Level 4 domain preset id (from lib/insights/domainPresets) — relabels kind groups only. */
  presetId?: string;
  /** When provided alongside overridePresetId/onPresetChange, renders the "MODE: X" picker
   *  inline in this navigator's own header instead of as a separate sibling component. */
  detectedPresetLabel?: string;
  overridePresetId?: string | null;
  onPresetChange?: (presetId: string | null) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Level 3: when the preset defines kindGroups (e.g. DAT's Concepts/Mechanisms/
  // Traps/High-Yield Facts), several raw kinds merge into one navigator section.
  // Presets without kindGroups keep today's exact one-section-per-kind behavior.
  // Shared with ThoughtRoadmap (Level 4) so both views agree on sectioning.
  const grouped = useMemo(() => groupThoughtUnits(entries, presetId), [entries, presetId]);

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  const header = (
    <div className="flex items-center justify-between gap-2 px-1">
      <span className="text-[9px] font-bold uppercase tracking-widest text-white/30 shrink-0">
        Thought Units
      </span>
      {detectedPresetLabel !== undefined && onPresetChange && (
        <DomainModeSelector
          detectedPresetLabel={detectedPresetLabel}
          overridePresetId={overridePresetId ?? null}
          onChange={onPresetChange}
        />
      )}
    </div>
  );

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <div className="px-2.5 py-3 text-[10.5px] text-white/35 leading-relaxed">
          No thought units detected on this page yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-1.5" data-testid="thought-unit-navigator">
      {header}
      {grouped.map(({ id, label, representativeKind, items }) => {
        const colors = KIND_COLORS[representativeKind] ?? FALLBACK_COLOR;
        const meta = { ...colors, label: label ?? getKindLabel(presetId, representativeKind as ParagraphKind) };
        const isCollapsed = collapsedGroups.has(id);
        return (
          <div key={id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleGroup(id)}
              className="flex items-center gap-1.5 px-1 py-0.5 text-left hover:opacity-80 transition-opacity"
            >
              <span
                className="shrink-0 rounded-full"
                style={{ width: 7, height: 7, background: meta.color }}
              />
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-white/55 truncate">
                {meta.label}
              </span>
              <span className="text-[9px] text-white/30">{items.length}</span>
              <span className="ml-auto text-[9px] text-white/30">{isCollapsed ? "▸" : "▾"}</span>
            </button>
            {!isCollapsed && items.map((entry) => {
              const focused = entry.id === focusedId;
              return (
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onJump(entry.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump(entry.id); }}
                  className="group relative flex flex-col gap-1 rounded-md px-2 py-1.5 cursor-pointer transition-colors"
                  style={{
                    background: focused ? meta.bg.replace("0.12", "0.28") : meta.bg,
                    border: `1px solid ${meta.color}${focused ? "88" : "33"}`,
                  }}
                  data-testid="thought-unit-entry"
                >
                  <span
                    className="text-[10.5px] leading-snug text-white/80"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {entry.text}
                  </span>
                  {(onExplain || onOpenRecall || onOpenNote) && (
                    <div className="self-end flex items-center gap-2 opacity-0 group-hover:opacity-100">
                      {onOpenNote && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenNote(entry.id); }}
                          className="text-[9px] text-white/40 hover:text-white/80 transition-colors"
                          title="Save a note on this thought unit"
                        >
                          📝 Note
                        </button>
                      )}
                      {onOpenRecall && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onOpenRecall(entry.id); }}
                          className="text-[9px] text-white/40 hover:text-white/80 transition-colors"
                          title="Open this thought unit in Recall Lab"
                        >
                          🧠 Recall
                        </button>
                      )}
                      {onExplain && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onExplain(entry.id); }}
                          className="text-[9px] text-white/40 hover:text-white/80 transition-colors"
                          title="Explain this thought unit"
                        >
                          💬 Explain
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
