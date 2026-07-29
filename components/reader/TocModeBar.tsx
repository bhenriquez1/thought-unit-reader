"use client";

// components/reader/TocModeBar.tsx
// Three-way TOC view-mode picker rendered inside the ThoughtUnitNavigator header.
//   Standard — kind-based or canonical-type groups (existing behavior)
//   Learning — entries bucketed in learning order (foundations → apply → watch out → anchor)
//   Concept  — grouped strictly by canonical semantic type

import React from "react";
import { useReaderModeStore, type TocViewMode } from "@/lib/reader/readerModeStore";

const TOC_VIEW_MODES: { mode: TocViewMode; label: string; title: string }[] = [
  {
    mode: "standard",
    label: "Standard",
    title: "Group by type — kind-based sections in priority order",
  },
  {
    mode: "learning",
    label: "Learning",
    title: "Learning order — foundations first, then apply, then watch out, then anchor",
  },
  {
    mode: "concept",
    label: "Concept",
    title: "By canonical semantic type — every distinct concept type gets its own section",
  },
];

interface TocModeBarProps {
  className?: string;
}

export default function TocModeBar({ className = "" }: TocModeBarProps) {
  const tocViewMode    = useReaderModeStore((s) => s.tocViewMode);
  const setTocViewMode = useReaderModeStore((s) => s.setTocViewMode);

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5 ${className}`}
      role="tablist"
      aria-label="TOC view mode"
      data-testid="toc-mode-bar"
    >
      {TOC_VIEW_MODES.map((d) => {
        const isActive = d.mode === tocViewMode;
        return (
          <button
            key={d.mode}
            role="tab"
            aria-selected={isActive}
            onClick={() => setTocViewMode(d.mode)}
            title={d.title}
            className={[
              "flex items-center rounded-md px-2 py-1 text-[9px] font-semibold tracking-wide transition-all",
              isActive
                ? "bg-white/10 text-white/90 shadow-sm"
                : "text-white/35 hover:text-white/60 hover:bg-white/5",
            ].join(" ")}
            data-testid={`toc-mode-${d.mode}`}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
