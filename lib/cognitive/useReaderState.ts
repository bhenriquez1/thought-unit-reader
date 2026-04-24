import { create } from 'zustand';
import type { InsightDepth } from '@/lib/stores/insightsPanelStore';
import { buildActivePageContext, type ActivePageContext } from '@/lib/surgeonEngine/activePageContext';

export type ReaderTab = 'priority' | 'explain' | 'relations' | 'compare' | 'insights' | 'narrate';
export type ReaderSectionMode = 'quick' | 'deep';

export interface ReaderState {
  docId: string;
  pageIndex: number;
  sectionId: string | null;
  paragraphId: string | null;
  activeTab: ReaderTab;
  insightDepth: InsightDepth;
  sectionMode: ReaderSectionMode;
}

type InsightCacheValue<T = unknown> = {
  data: T;
  updatedAt: number;
};

interface ReaderStateStore extends ReaderState {
  activePageContext: ActivePageContext;
  insightCache: Record<string, InsightCacheValue>;
  setDocument: (docId: string) => void;
  setActivePageContext: (next: Partial<ActivePageContext>) => void;
  setPageState: (next: Pick<ReaderState, 'pageIndex' | 'sectionId' | 'paragraphId'>) => void;
  setActiveTab: (tab: ReaderTab) => void;
  setInsightDepth: (depth: InsightDepth) => void;
  setSectionMode: (mode: ReaderSectionMode) => void;
  setSectionId: (sectionId: string | null) => void;
  setParagraphId: (paragraphId: string | null) => void;
  resetInsightState: () => void;
  buildCacheKey: (tab?: ReaderTab, depth?: InsightDepth, pageIndex?: number) => string;
  setCachedInsight: <T = unknown>(key: string, data: T) => void;
  getCachedInsight: <T = unknown>(key: string) => T | undefined;
  invalidateInsightCache: (pageIndex: number) => void;
  onPageChange: (newPage: number) => void;
}

const DEFAULT_TAB: ReaderTab = 'priority';
const DEFAULT_DEPTH: InsightDepth = 'standard';

export const useReaderState = create<ReaderStateStore>((set, get) => ({
  docId: '',
  pageIndex: 0,
  sectionId: null,
  paragraphId: null,
  activeTab: DEFAULT_TAB,
  insightDepth: DEFAULT_DEPTH,
  sectionMode: 'quick',
  activePageContext: buildActivePageContext({}),
  insightCache: {},

  setDocument: (docId) => set({ docId, activePageContext: buildActivePageContext({ documentId: docId }) }),
  setActivePageContext: (next) => set((state) => ({ activePageContext: buildActivePageContext({ ...state.activePageContext, ...next }) })),
  setPageState: (next) => set(next),
  setActiveTab: (activeTab) => set((state) => ({ activeTab, activePageContext: buildActivePageContext({ ...state.activePageContext, tab: activeTab === 'narrate' ? 'priority' : activeTab }) })),
  setInsightDepth: (insightDepth) => set({ insightDepth }),
  setSectionMode: (sectionMode) => set({ sectionMode }),
  setSectionId: (sectionId) => set({ sectionId }),
  setParagraphId: (paragraphId) => set({ paragraphId }),

  resetInsightState: () => set({ sectionId: null, paragraphId: null }),

  buildCacheKey: (tab = get().activeTab, depth = get().insightDepth, pageIndex = get().pageIndex) => {
    return `${get().docId}-${pageIndex}-${tab}-${depth}`;
  },

  setCachedInsight: (key, data) =>
    set((state) => ({
      insightCache: {
        ...state.insightCache,
        [key]: {
          data,
          updatedAt: Date.now(),
        },
      },
    })),

  getCachedInsight: (key) => {
    const cached = get().insightCache[key];
    return cached?.data as never;
  },

  invalidateInsightCache: (pageIndex) =>
    set((state) => ({
      insightCache: Object.fromEntries(
        Object.entries(state.insightCache).filter(([key]) => !key.startsWith(`${state.docId}-${pageIndex}-`)),
      ),
    })),

  onPageChange: (newPage) => {
    const nextPageIndex = Math.max(0, newPage - 1);
    get().setPageState({
      pageIndex: nextPageIndex,
      sectionId: null,
      paragraphId: null,
    });
    get().resetInsightState();
    get().setActivePageContext({ pageNumber: newPage, sectionId: null });
    get().invalidateInsightCache(nextPageIndex);
  },
}));
