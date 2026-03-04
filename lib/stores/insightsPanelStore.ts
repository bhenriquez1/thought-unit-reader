// lib/stores/insightsPanelStore.ts
// UI state for the Insights / Priority right panel:
//   - insightScale: font-size multiplier for card text (CSS-variable-driven, no transform)
//   - syncInsightsToPdf: when true, the active insight tracks PDF scroll / selection
//   - activeParagraphId: the insight item currently considered "active"
//   - tone/depth/renderPolicy: single source of truth for paragraph intelligence rendering

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const INSIGHT_SCALES = [0.9, 1.0, 1.1, 1.25, 1.4] as const;
export type InsightScale = typeof INSIGHT_SCALES[number];
export type InsightTone = 'polish' | 'student' | 'clinical' | 'expert';
export type InsightDepth = 'minimal' | 'standard' | 'deep';
export type InsightRenderPolicy = 'condensed' | 'expanded';

interface InsightsPanelState {
  // ── Zoom ──────────────────────────────────────────────────────────────────
  insightScale: InsightScale;
  setInsightScale: (scale: InsightScale) => void;
  scaleUp: () => void;
  scaleDown: () => void;
  resetScale: () => void;
  canScaleUp: () => boolean;
  canScaleDown: () => boolean;

  // ── Orientation/tone/depth single-source state ───────────────────────────
  tone: InsightTone;
  setTone: (tone: InsightTone) => void;
  depth: InsightDepth;
  setDepth: (depth: InsightDepth) => void;
  renderPolicy: InsightRenderPolicy;
  setRenderPolicy: (policy: InsightRenderPolicy) => void;

  // ── Sync toggle ───────────────────────────────────────────────────────────
  syncInsightsToPdf: boolean;
  setSyncInsightsToPdf: (sync: boolean) => void;
  toggleSync: () => void;

  // ── Active anchor ─────────────────────────────────────────────────────────
  activeParagraphId: string | null;
  setActiveParagraphId: (id: string | null) => void;

  // ── Selection (set on insight card click) ────────────────────────────────
  selectedInsightId: string | null;
  setSelectedInsightId: (id: string | null) => void;

  activeVisibleText: string | null;
  setActiveVisibleText: (text: string | null) => void;

  focusOnSource: (id: string) => void;
}

export const useInsightsPanelStore = create<InsightsPanelState>()(
  persist(
    (set, get) => ({
      insightScale: 1.0,
      setInsightScale: (scale) => set({ insightScale: scale }),
      scaleUp: () => {
        const idx = INSIGHT_SCALES.indexOf(get().insightScale);
        if (idx < INSIGHT_SCALES.length - 1) set({ insightScale: INSIGHT_SCALES[idx + 1] });
      },
      scaleDown: () => {
        const idx = INSIGHT_SCALES.indexOf(get().insightScale);
        if (idx > 0) set({ insightScale: INSIGHT_SCALES[idx - 1] });
      },
      resetScale: () => set({ insightScale: 1.0 }),
      canScaleUp: () => INSIGHT_SCALES.indexOf(get().insightScale) < INSIGHT_SCALES.length - 1,
      canScaleDown: () => INSIGHT_SCALES.indexOf(get().insightScale) > 0,

      tone: 'clinical',
      setTone: (tone) => set({ tone }),
      depth: 'standard',
      setDepth: (depth) => set({ depth }),
      renderPolicy: 'condensed',
      setRenderPolicy: (renderPolicy) => set({ renderPolicy }),

      syncInsightsToPdf: false,
      setSyncInsightsToPdf: (sync) => set({ syncInsightsToPdf: sync }),
      toggleSync: () => set((s) => ({ syncInsightsToPdf: !s.syncInsightsToPdf })),

      activeParagraphId: null,
      setActiveParagraphId: (id) => set({ activeParagraphId: id }),

      selectedInsightId: null,
      setSelectedInsightId: (id) => set({ selectedInsightId: id }),

      activeVisibleText: null,
      setActiveVisibleText: (text) => set({ activeVisibleText: text }),

      focusOnSource: (id) => set({ activeParagraphId: id, selectedInsightId: id }),
    }),
    {
      name: 'insights-panel-storage',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        return localStorage;
      }),
      partialize: (state) => ({
        insightScale: state.insightScale,
        syncInsightsToPdf: state.syncInsightsToPdf,
        tone: state.tone,
        depth: state.depth,
        renderPolicy: state.renderPolicy,
      }),
    }
  )
);
