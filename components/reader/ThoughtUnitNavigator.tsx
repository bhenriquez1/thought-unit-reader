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

export interface ThoughtUnitNavigatorEntry {
  id: string;
  text: string;
  kind: ParagraphKind;
}

interface KindMeta {
  label: string;
  color: string;
  bg: string;
}

const KIND_META: Record<string, KindMeta> = {
  thesis:      { label: "Core Idea",             color: "#fde047", bg: "rgba(253,224,71,0.12)" },
  definition:  { label: "Definition / Term",      color: "#93c5fd", bg: "rgba(147,197,253,0.12)" },
  mechanism:   { label: "Mechanism / Function",   color: "#86efac", bg: "rgba(134,239,172,0.12)" },
  application: { label: "Example / Evidence",     color: "#c084fc", bg: "rgba(192,132,252,0.12)" },
  trap:        { label: "Confusion / Trap",       color: "#fca5a5", bg: "rgba(252,165,165,0.12)" },
  dat_fact:    { label: "DAT / High-Yield Fact",  color: "#fed7aa", bg: "rgba(251,146,60,0.12)" },
};
const KIND_ORDER = ["thesis", "dat_fact", "mechanism", "trap", "application", "definition"];
const FALLBACK_META: KindMeta = { label: "Other", color: "#cbd5e1", bg: "rgba(203,213,225,0.10)" };

export default function ThoughtUnitNavigator({
  entries,
  focusedId,
  onJump,
  onExplain,
}: {
  entries: ThoughtUnitNavigatorEntry[];
  focusedId?: string | null;
  onJump: (id: string) => void;
  onExplain?: (id: string) => void;
}) {
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const byKind = new Map<string, ThoughtUnitNavigatorEntry[]>();
    for (const e of entries) {
      const list = byKind.get(e.kind) ?? [];
      list.push(e);
      byKind.set(e.kind, list);
    }
    return KIND_ORDER
      .map((kind) => ({ kind, items: byKind.get(kind) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [entries]);

  const toggleKind = (kind: string) => {
    setCollapsedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  if (entries.length === 0) {
    return (
      <div className="px-2.5 py-3 text-[10.5px] text-white/35 leading-relaxed">
        No thought units detected on this page yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto flex-1 px-1.5 pb-3" data-testid="thought-unit-navigator">
      {grouped.map(({ kind, items }) => {
        const meta = KIND_META[kind] ?? FALLBACK_META;
        const isCollapsed = collapsedKinds.has(kind);
        return (
          <div key={kind} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => toggleKind(kind)}
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
                  {onExplain && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onExplain(entry.id); }}
                      className="self-end text-[9px] text-white/40 hover:text-white/80 transition-colors opacity-0 group-hover:opacity-100"
                      title="Explain this thought unit"
                    >
                      💬 Explain
                    </button>
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
