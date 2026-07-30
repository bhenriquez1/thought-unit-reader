// lib/reader/readerModeStore.ts
// Reader mode — controls how the adaptive left panel presents canonical units.
//
//   study  — all semantic groups visible, importance emphasized, evidence panel enabled
//   exam   — high-yield types surfaced first, low-importance items hidden
//   review — recently-touched units first, recall metadata visible
//
// This is a pure UI transformation. The underlying canonical units and their
// importanceScore / canonicalType values are never mutated by a mode switch.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReaderMode = "study" | "exam" | "review";

/** How the left-panel navigator arranges its entries. */
export type TocViewMode = "standard" | "learning" | "concept";

export interface ReaderModeState {
  mode: ReaderMode;
  setMode: (mode: ReaderMode) => void;
  tocViewMode: TocViewMode;
  setTocViewMode: (mode: TocViewMode) => void;
}

export const useReaderModeStore = create<ReaderModeState>()(
  persist(
    (set) => ({
      mode: "study",
      setMode: (mode) => set({ mode }),
      tocViewMode: "standard",
      setTocViewMode: (tocViewMode) => set({ tocViewMode }),
    }),
    { name: "avrrio-reader-mode" },
  ),
);

// ── Mode metadata ─────────────────────────────────────────────────────────────

export interface ReaderModeDescriptor {
  mode: ReaderMode;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
}

export const READER_MODE_DESCRIPTORS: ReaderModeDescriptor[] = [
  {
    mode: "study",
    label: "Study",
    shortLabel: "Study",
    description: "All concepts visible. Importance emphasized. Evidence panel enabled.",
    icon: "📚",
  },
  {
    mode: "exam",
    label: "Exam",
    shortLabel: "Exam",
    description: "High-yield concepts prioritized. Definitions collapsed. Examples highlighted.",
    icon: "🎯",
  },
  {
    mode: "review",
    label: "Review",
    shortLabel: "Review",
    description: "Recently studied units surfaced first. All types visible for reinforcement.",
    icon: "🔄",
  },
];

export function getReaderModeDescriptor(mode: ReaderMode): ReaderModeDescriptor {
  return READER_MODE_DESCRIPTORS.find((d) => d.mode === mode) ?? READER_MODE_DESCRIPTORS[0];
}
