// lib/readerSync.ts
import { create } from 'zustand';

export interface ReaderSyncState {
  // Current state
  page: number;
  unitIndex: number;
  activeChunkId: string | null;
  
  // Actions
  setPage: (page: number) => void;
  setUnitIndex: (index: number) => void;
  setActiveChunkId: (id: string | null) => void;
  
  // Batch update for efficiency
  updateSync: (updates: Partial<Pick<ReaderSyncState, 'page' | 'unitIndex' | 'activeChunkId'>>) => void;
}

export const useReaderSync = create<ReaderSyncState>((set, get) => ({
  // Initial state
  page: 1,
  unitIndex: 1,
  activeChunkId: null,
  
  // Actions
  setPage: (page: number) => {
    console.log(`🔄 ReaderSync: setPage(${page})`);
    set({ page });
  },
  
  setUnitIndex: (unitIndex: number) => {
    console.log(`🔄 ReaderSync: setUnitIndex(${unitIndex})`);
    set({ unitIndex });
  },
  
  setActiveChunkId: (activeChunkId: string | null) => {
    console.log(`🔄 ReaderSync: setActiveChunkId(${activeChunkId})`);
    set({ activeChunkId });
  },
  
  // Batch update to prevent multiple re-renders
  updateSync: (updates) => {
    console.log(`🔄 ReaderSync: updateSync`, updates);
    set((state) => ({ ...state, ...updates }));
  },
}));

// Helper function to create stable chunk IDs (reuse existing logic)
export function stableChunkId(text: string): string {
  const t = (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  // fast 32-bit FNV-like hash -> base36 string
  let h = 2166136261 >>> 0;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}
