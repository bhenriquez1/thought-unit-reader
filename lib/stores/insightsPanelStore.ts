// lib/stores/insightsPanelStore.ts
// UI state for the Insights / Priority right panel:
//   - insightScale: font-size multiplier for card text (CSS-variable-driven, no transform)
//   - syncInsightsToPdf: when true, the active insight tracks PDF scroll / selection
//   - activeParagraphId: the insight item currently considered "active"

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const INSIGHT_SCALES = [0.9, 1.0, 1.1, 1.25, 1.4] as const;
export type InsightScale = typeof INSIGHT_SCALES[number];

interface InsightsPanelState {
  // ── Zoom ──────────────────────────────────────────────────────────────────
  /** CSS font-scale multiplier for insight cards. Stored as exact members of INSIGHT_SCALES. */
  insightScale: InsightScale;
  setInsightScale: (scale: InsightScale) => void;
  scaleUp: () => void;
  scaleDown: () => void;
  resetScale: () => void;
  canScaleUp: () => boolean;
  canScaleDown: () => boolean;

  // ── Sync toggle ───────────────────────────────────────────────────────────
  /**
   * When true (default), the insights panel scrolls its active item into view
   * whenever the active insight changes (driven by PDF paragraph selection).
   * When false, the user scrolls insights freely; clicking an insight still
   * highlights the PDF region.
   */
  syncInsightsToPdf: boolean;
  setSyncInsightsToPdf: (sync: boolean) => void;
  toggleSync: () => void;

  // ── Active anchor ─────────────────────────────────────────────────────────
  /**
   * ID of the insight item currently "focused" (from PDF selection or insight click).
   * Used by PriorityComprehensionPanel to scroll the card into view when sync is on.
   */
  activeParagraphId: string | null;
  setActiveParagraphId: (id: string | null) => void;
}

export const useInsightsPanelStore = create<InsightsPanelState>()(
  persist(
    (set, get) => ({
      // ── Zoom ──
      insightScale: 1.0,

      setInsightScale: (scale) => set({ insightScale: scale }),

      scaleUp: () => {
        const idx = INSIGHT_SCALES.indexOf(get().insightScale);
        if (idx < INSIGHT_SCALES.length - 1) {
          set({ insightScale: INSIGHT_SCALES[idx + 1] });
        }
      },

      scaleDown: () => {
        const idx = INSIGHT_SCALES.indexOf(get().insightScale);
        if (idx > 0) {
          set({ insightScale: INSIGHT_SCALES[idx - 1] });
        }
      },

      resetScale: () => set({ insightScale: 1.0 }),

      canScaleUp: () => {
        const idx = INSIGHT_SCALES.indexOf(get().insightScale);
        return idx < INSIGHT_SCALES.length - 1;
      },

      canScaleDown: () => {
        const idx = INSIGHT_SCALES.indexOf(get().insightScale);
        return idx > 0;
      },

      // ── Sync toggle ──
      syncInsightsToPdf: true,
      setSyncInsightsToPdf: (sync) => set({ syncInsightsToPdf: sync }),
      toggleSync: () => set((s) => ({ syncInsightsToPdf: !s.syncInsightsToPdf })),

      // ── Active anchor ──
      activeParagraphId: null,
      setActiveParagraphId: (id) => set({ activeParagraphId: id }),
    }),
    {
      name: 'insights-panel-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
      // Persist user preferences but not transient active-id
      partialize: (state) => ({
        insightScale: state.insightScale,
        syncInsightsToPdf: state.syncInsightsToPdf,
      }),
    }
  )
);
