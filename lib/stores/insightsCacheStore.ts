import { create } from 'zustand';

export type InsightCacheKey = `${string}:${number}:${string}`;

interface InsightsCacheState {
  insightsCache: Map<InsightCacheKey, unknown>;
  setInsight: (key: InsightCacheKey, value: unknown) => void;
  getInsight: (key: InsightCacheKey) => unknown | undefined;
  clearBook: (bookId: string) => void;
  clearAll: () => void;
}

// NOTE: Intentionally NOT persisted. Heavy analysis should stay in-memory.
export const useInsightsCacheStore = create<InsightsCacheState>((set, get) => ({
  insightsCache: new Map(),

  setInsight: (key, value) =>
    set((state) => {
      const next = new Map(state.insightsCache);
      next.set(key, value);
      return { insightsCache: next };
    }),

  getInsight: (key) => get().insightsCache.get(key),

  clearBook: (bookId) =>
    set((state) => {
      const next = new Map<InsightCacheKey, unknown>();
      state.insightsCache.forEach((value, key) => {
        if (!key.startsWith(`${bookId}:`)) {
          next.set(key, value);
        }
      });
      return { insightsCache: next };
    }),

  clearAll: () => set({ insightsCache: new Map() }),
}));
