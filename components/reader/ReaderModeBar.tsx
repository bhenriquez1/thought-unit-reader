"use client";

// components/reader/ReaderModeBar.tsx
// Reader mode selector: Study / Exam / Review.
// This is a pure UI control — it writes to useReaderModeStore; no data mutation.

import React from "react";
import { useReaderModeStore, READER_MODE_DESCRIPTORS, type ReaderMode } from "@/lib/reader/readerModeStore";

interface ReaderModeBarProps {
  /** Override: external mode value + change handler (for controlled usage). */
  mode?: ReaderMode;
  onChange?: (mode: ReaderMode) => void;
  className?: string;
}

export default function ReaderModeBar({ mode: modeProp, onChange, className = "" }: ReaderModeBarProps) {
  const storeMode    = useReaderModeStore((s) => s.mode);
  const storeSetMode = useReaderModeStore((s) => s.setMode);

  const activeMode = modeProp ?? storeMode;
  const setMode = (m: ReaderMode) => {
    storeSetMode(m);
    onChange?.(m);
  };

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5 ${className}`}
      role="tablist"
      aria-label="Reader mode"
      data-testid="reader-mode-bar"
    >
      {READER_MODE_DESCRIPTORS.map((d) => {
        const isActive = d.mode === activeMode;
        return (
          <button
            key={d.mode}
            role="tab"
            aria-selected={isActive}
            onClick={() => setMode(d.mode)}
            title={d.description}
            className={[
              "flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-semibold tracking-wide transition-all",
              isActive
                ? "bg-white/10 text-white/90 shadow-sm"
                : "text-white/35 hover:text-white/60 hover:bg-white/5",
            ].join(" ")}
            data-testid={`reader-mode-${d.mode}`}
          >
            <span className="text-[10px] leading-none">{d.icon}</span>
            <span className="hidden sm:inline">{d.label}</span>
          </button>
        );
      })}
    </div>
  );
}
