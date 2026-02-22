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
   * When true, the insights panel scrolls its active item into view whenever
   * the active insight changes (driven by PDF paragraph selection).
   * Default OFF so the user can scroll both panels independently; clicking
   * an insight still highlights the PDF region regardless of this toggle.
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

  // ── Selection (set on insight card click) ────────────────────────────────
  /** ID of the last insight card the user clicked. */
  selectedInsightId: string | null;
  setSelectedInsightId: (id: string | null) => void;

  /** Raw text snippet of the paragraph currently visible in the PDF (from scroll detection). */
  activeVisibleText: string | null;
  setActiveVisibleText: (text: string | null) => void;

  // ── Source focus (called when user clicks an insight card) ────────────────
  /**
   * Set both activeParagraphId and selectedInsightId in one call.
   * SurgeonCockpit calls this on every insight click so PDF sync-scroll
   * and panel highlight both fire from a single source of truth.
   * Compatible with AnchoredItem.sourceRef.paragraphId or any stable insight id.
   */
  focusOnSource: (id: string) => void;
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
      syncInsightsToPdf: false, // OFF by default — user opts in; click-to-focus always works
      setSyncInsightsToPdf: (sync) => set({ syncInsightsToPdf: sync }),
      toggleSync: () => set((s) => ({ syncInsightsToPdf: !s.syncInsightsToPdf })),

      // ── Active anchor ──
      activeParagraphId: null,
      setActiveParagraphId: (id) => set({ activeParagraphId: id }),

      // ── Selection ──
      selectedInsightId: null,
      setSelectedInsightId: (id) => set({ selectedInsightId: id }),

      activeVisibleText: null,
      setActiveVisibleText: (text) => set({ activeVisibleText: text }),

      // ── Source focus ──
      focusOnSource: (id) => set({ activeParagraphId: id, selectedInsightId: id }),
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
