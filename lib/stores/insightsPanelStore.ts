// lib/stores/insightsPanelStore.ts
// UI state for the Insights / Priority right panel:
//   - insightScale: font-size multiplier for card text (CSS-variable-driven, no transform)
//   - syncInsightsToPdf: when true, the active insight tracks PDF scroll / selection
//   - activeParagraphId: the insight item currently considered "active"

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export const INSIGHT_SCALES = [0.9, 1.0, 1.1, 1.25, 1.4] as const;
export type InsightScale = typeof INSIGHT_SCALES[number];

export type InsightMode = 'quick' | 'deep';
export type InsightTone = 'polish' | 'student' | 'clinical' | 'expert';
export type InsightDepth = 'minimal' | 'standard' | 'deep';
export type InsightView = 'condensed' | 'expanded';

interface InsightsPanelState {
  // ── Cognitive controls (drives Page Intelligence rendering) ───────────────
  essentialStudentMode: boolean;
  setEssentialStudentMode: (enabled: boolean) => void;

  mode: InsightMode;
  setMode: (mode: InsightMode) => void;

  audience: InsightTone;
  setAudience: (audience: InsightTone) => void;

  depth: InsightDepth;
  setDepth: (depth: InsightDepth) => void;

  view: InsightView;
  setView: (view: InsightView) => void;

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

  // ── Expand/collapse state (condensed/expanded cards) ─────────────────────
  expandedCardIds: string[];
  setExpandedCardIds: (ids: string[]) => void;

  /** Raw text snippet of the paragraph currently visible in the PDF (from scroll detection). */
  activeVisibleText: string | null;
  setActiveVisibleText: (text: string | null) => void;

  // ── Optional follow-scroll mode (panel tracks PDF scroll heuristics) ─────
  followScroll: boolean;
  setFollowScroll: (follow: boolean) => void;

  // ── Source focus (called when user clicks an insight card) ────────────────
  /**
   * Set both activeParagraphId and selectedInsightId in one call.
   * SurgeonCockpit calls this on every insight click so PDF sync-scroll
   * and panel highlight both fire from a single source of truth.
   * Compatible with AnchoredItem.sourceRef.paragraphId or any stable insight id.
   */
  focusOnSource: (id: string) => void;

  // ── Convenience reset used by SurgeonCockpit Reset button ────────────────
  resetInsightLayout: () => void;

  // ── Pinned texts (used by Reader highlight overlays) ─────────────────────
  pinnedTexts: string[];
  pinText: (text: string) => void;
  unpinText: (text: string) => void;
  isPinned: (text: string) => boolean;
  clearPinnedTexts: () => void;
}

export const useInsightsPanelStore = create<InsightsPanelState>()(
  persist(
    (set, get) => ({
      // ── Cognitive controls ──
      essentialStudentMode: true,
      setEssentialStudentMode: (essentialStudentMode) => set({ essentialStudentMode }),

      mode: 'quick',
      setMode: (mode) => set({ mode }),

      audience: 'student',
      setAudience: (audience) => set({ audience }),

      depth: 'standard',
      setDepth: (depth) => set({ depth }),

      view: 'condensed',
      setView: (view) => set({ view }),

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
      syncInsightsToPdf: false, // OFF by default — no scroll coupling
      setSyncInsightsToPdf: (sync) => set({ syncInsightsToPdf: sync }),
      toggleSync: () => set((s) => ({ syncInsightsToPdf: !s.syncInsightsToPdf })),

      // ── Active anchor ──
      activeParagraphId: null,
      setActiveParagraphId: (id) => set({ activeParagraphId: id }),

      // ── Selection ──
      selectedInsightId: null,
      setSelectedInsightId: (id) => set({ selectedInsightId: id }),

      expandedCardIds: [],
      setExpandedCardIds: (ids) => set({ expandedCardIds: ids.slice(0, 500) }),

      activeVisibleText: null,
      setActiveVisibleText: (text) => set({ activeVisibleText: text }),

      followScroll: false,
      setFollowScroll: (follow) => set({ followScroll: follow }),

      // ── Source focus ──
      focusOnSource: (id) => set({ activeParagraphId: id, selectedInsightId: id }),

      resetInsightLayout: () => set({
        insightScale: 1.0,
        syncInsightsToPdf: false,
        essentialStudentMode: true,
        mode: 'quick',
        audience: 'student',
        depth: 'standard',
        view: 'condensed',
        followScroll: false,
        expandedCardIds: [],
        selectedInsightId: null,
        activeParagraphId: null,
        activeVisibleText: null,
      }),

      pinnedTexts: [],
      pinText: (text) => set((s) => ({
        pinnedTexts: s.pinnedTexts.includes(text) ? s.pinnedTexts : [...s.pinnedTexts, text],
      })),
      unpinText: (text) => set((s) => ({ pinnedTexts: s.pinnedTexts.filter((t) => t !== text) })),
      isPinned: (text) => get().pinnedTexts.includes(text),
      clearPinnedTexts: () => set({ pinnedTexts: [] }),
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
        essentialStudentMode: state.essentialStudentMode,
        mode: state.mode,
        audience: state.audience,
        depth: state.depth,
        view: state.view,
        followScroll: state.followScroll,

        // pinned texts are user intent; keep it bounded
        pinnedTexts: state.pinnedTexts.slice(0, 200),
      }),
    }
  )
);
