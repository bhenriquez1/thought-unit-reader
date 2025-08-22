// lib/readerSync.ts
import { create } from 'zustand';
import type { TOCEntry } from './tocParser';

export type SyncSource = "pdf" | "progressive" | "hybrid" | "toc" | "whiteboard" | "manual";

export interface ChapterBoundary {
  page: number;
  unitStart: number;
  unitEnd: number;
  title: string;
  confidence: number;
}

export interface ContentDensity {
  page: number;
  density: number; // 0-1, how much content is on this page
  hasFormulas: boolean;
  hasDiagrams: boolean;
  wordCount: number;
}

export interface ReaderSyncState {
  // Current state
  page: number;
  unitIndex: number;
  activeChunkId: string | null;
  
  // Enhanced state for smart sync
  lastUpdateSource: SyncSource | null;
  lastUpdateTimestamp: number;
  lastNavReason: 'SCROLL' | 'TOC_JUMP' | 'PROGRAMMATIC' | null;
  
  // Content mapping data
  totalPages: number;
  totalUnits: number;
  contentDensityMap: Map<number, ContentDensity>;
  chapterBoundaries: ChapterBoundary[];
  
  // TOC integration
  tableOfContents: TOCEntry[];
  
  // Whiteboard chapter animation state
  currentChapterId: string | null;
  chapterAnimationSteps: Map<string, number>; // chapterId -> current step index
  animationScriptCache: Map<string, any[]>; // chapterId -> animation steps
  
  // Actions with source tracking
  setPage: (page: number, source?: SyncSource) => void;
  setUnitIndex: (index: number, source?: SyncSource) => void;
  setActiveChunkId: (id: string | null, source?: SyncSource) => void;
  
  // Enhanced batch update with loop prevention
  updateSync: (updates: Partial<Pick<ReaderSyncState, 'page' | 'unitIndex' | 'activeChunkId'>>, source?: SyncSource) => void;
  
  // Smart mathematical mapping
  pageToUnitSmart: (page: number) => number;
  unitToPageSmart: (unit: number) => number;
  
  // Content-aware navigation
  syncToChapter: (chapterTitle: string) => boolean;
  findNearestChapter: (page: number) => ChapterBoundary | null;
  
  // Setup methods
  initializeContent: (totalPages: number, totalUnits: number, toc: TOCEntry[]) => void;
  updateContentDensity: (page: number, density: ContentDensity) => void;
  buildChapterBoundaries: () => void;
  
  // Whiteboard chapter animation methods
  setCurrentChapter: (chapterId: string | null) => void;
  getAnimationStep: (chapterId: string) => number;
  setAnimationStep: (chapterId: string, step: number) => void;
  cacheAnimationScript: (chapterId: string, script: any[]) => void;
  getAnimationScript: (chapterId: string) => any[] | null;
}

export const useReaderSync = create<ReaderSyncState>((set, get) => ({
  // Initial state
  page: 1,
  unitIndex: 1,
  activeChunkId: null,
  lastUpdateSource: null,
  lastUpdateTimestamp: 0,
  lastNavReason: null,
  
  // Content mapping
  totalPages: 1,
  totalUnits: 1,
  contentDensityMap: new Map(),
  chapterBoundaries: [],
  tableOfContents: [],
  
  // Whiteboard chapter animation state
  currentChapterId: null,
  chapterAnimationSteps: new Map(),
  animationScriptCache: new Map(),
  
  // Enhanced actions with source tracking and relaxed loop prevention
  setPage: (page: number, source: SyncSource = "manual") => {
    const state = get();
    const now = Date.now();
    
    // Only prevent rapid updates from the exact same source with same value
    if (state.lastUpdateSource === source && state.page === page && now - state.lastUpdateTimestamp < 50) {
      return;
    }
    
    console.log(`🔄 ReaderSync: setPage(${page}) from ${source}`);
    
    // Calculate corresponding unit using smart mapping
    const smartUnit = state.pageToUnitSmart(page);
    
    set({ 
      page, 
      unitIndex: smartUnit,
      lastUpdateSource: source,
      lastUpdateTimestamp: now
    });
  },
  
  setUnitIndex: (unitIndex: number, source: SyncSource = "manual") => {
    const state = get();
    const now = Date.now();
    
    // Only prevent rapid updates from the exact same source with same value
    if (state.lastUpdateSource === source && state.unitIndex === unitIndex && now - state.lastUpdateTimestamp < 50) {
      return;
    }
    
    console.log(`🔄 ReaderSync: setUnitIndex(${unitIndex}) from ${source}`);
    
    // Calculate corresponding page using smart mapping
    const smartPage = state.unitToPageSmart(unitIndex);
    
    set({ 
      unitIndex, 
      page: smartPage,
      lastUpdateSource: source,
      lastUpdateTimestamp: now
    });
  },
  
  setActiveChunkId: (activeChunkId: string | null, source: SyncSource = "manual") => {
    const state = get();
    const now = Date.now();
    
    console.log(`🔄 ReaderSync: setActiveChunkId(${activeChunkId}) from ${source}`);
    
    set({ 
      activeChunkId,
      lastUpdateSource: source,
      lastUpdateTimestamp: now
    });
  },
  
  // Enhanced batch update with smart sync and relaxed loop prevention
  updateSync: (updates, source: SyncSource = "manual") => {
    const state = get();
    const now = Date.now();
    
    // Only prevent if exact same updates from same source within short time
    const samePageUpdate = updates.page !== undefined && state.page === updates.page;
    const sameUnitUpdate = updates.unitIndex !== undefined && state.unitIndex === updates.unitIndex;
    const sameChunkUpdate = updates.activeChunkId !== undefined && state.activeChunkId === updates.activeChunkId;
    
    if (state.lastUpdateSource === source && (samePageUpdate || sameUnitUpdate || sameChunkUpdate) && now - state.lastUpdateTimestamp < 50) {
      return;
    }
    
    console.log(`🔄 ReaderSync: updateSync from ${source}`, updates);
    
    // Apply smart mapping if both page and unit are being updated
    let finalUpdates = { ...updates };
    
    if (updates.page !== undefined && updates.unitIndex === undefined) {
      finalUpdates.unitIndex = state.pageToUnitSmart(updates.page);
    } else if (updates.unitIndex !== undefined && updates.page === undefined) {
      finalUpdates.page = state.unitToPageSmart(updates.unitIndex);
    }
    
    set((currentState) => ({ 
      ...currentState, 
      ...finalUpdates,
      lastUpdateSource: source,
      lastUpdateTimestamp: now
    }));
  },
  
  // Smart mathematical mapping with content density awareness
  pageToUnitSmart: (page: number) => {
    const state = get();
    if (state.totalPages <= 1 || state.totalUnits <= 1) return 1;
    
    // Find the chapter this page belongs to
    const chapter = state.findNearestChapter(page);
    
    if (chapter && chapter.unitStart && chapter.unitEnd) {
      // Use chapter-based mapping for more accuracy
      const chapterPageSpan = getChapterPageSpan(chapter, state.chapterBoundaries);
      if (chapterPageSpan > 0) {
        const pageOffsetInChapter = page - chapter.page;
        const progressInChapter = Math.max(0, Math.min(1, pageOffsetInChapter / chapterPageSpan));
        const unitSpan = chapter.unitEnd - chapter.unitStart + 1;
        const unitInChapter = Math.round(progressInChapter * unitSpan);
        return Math.max(1, Math.min(state.totalUnits, chapter.unitStart + unitInChapter));
      }
    }
    
    // Fallback to content-density-aware mapping
    const density = state.contentDensityMap.get(page);
    const densityMultiplier = density ? (0.8 + density.density * 0.4) : 1.0; // 0.8-1.2 range
    
    const baseRatio = (page - 1) / Math.max(1, state.totalPages - 1);
    const adjustedRatio = Math.max(0, Math.min(1, baseRatio * densityMultiplier));
    
    return Math.max(1, Math.min(state.totalUnits, Math.round(adjustedRatio * state.totalUnits) + 1));
  },
  
  unitToPageSmart: (unit: number) => {
    const state = get();
    if (state.totalPages <= 1 || state.totalUnits <= 1) return 1;
    
    // Find the chapter this unit belongs to
    const chapter = state.chapterBoundaries.find(ch => 
      unit >= ch.unitStart && unit <= ch.unitEnd
    );
    
    if (chapter) {
      // Use chapter-based mapping
      const unitOffsetInChapter = unit - chapter.unitStart;
      const unitSpan = chapter.unitEnd - chapter.unitStart + 1;
      const progressInChapter = unitSpan > 1 ? unitOffsetInChapter / (unitSpan - 1) : 0;
      const chapterPageSpan = getChapterPageSpan(chapter, state.chapterBoundaries);
      const pageInChapter = Math.round(progressInChapter * chapterPageSpan);
      return Math.max(1, Math.min(state.totalPages, chapter.page + pageInChapter));
    }
    
    // Fallback to linear mapping with slight content density adjustment
    const baseRatio = (unit - 1) / Math.max(1, state.totalUnits - 1);
    return Math.max(1, Math.min(state.totalPages, Math.round(baseRatio * state.totalPages) + 1));
  },
  
  // Chapter-aware navigation
  syncToChapter: (chapterTitle: string) => {
    const state = get();
    const chapter = state.chapterBoundaries.find(ch => 
      ch.title.toLowerCase().includes(chapterTitle.toLowerCase()) ||
      chapterTitle.toLowerCase().includes(ch.title.toLowerCase())
    );
    
    if (chapter) {
      console.log(`🔄 ReaderSync: syncToChapter("${chapterTitle}") -> page ${chapter.page}`);
      state.setPage(chapter.page, "toc");
      return true;
    }
    
    // Try TOC fallback
    const tocEntry = findTOCEntry(state.tableOfContents, chapterTitle);
    if (tocEntry) {
      console.log(`🔄 ReaderSync: syncToChapter via TOC("${chapterTitle}") -> page ${tocEntry.pageNumber}`);
      state.setPage(tocEntry.pageNumber, "toc");
      return true;
    }
    
    return false;
  },
  
  findNearestChapter: (page: number) => {
    const state = get();
    let nearest: ChapterBoundary | null = null;
    
    for (const chapter of state.chapterBoundaries) {
      if (chapter.page <= page) {
        if (!nearest || chapter.page > nearest.page) {
          nearest = chapter;
        }
      }
    }
    
    return nearest;
  },
  
  // Setup and maintenance methods
  initializeContent: (totalPages: number, totalUnits: number, toc: TOCEntry[]) => {
    console.log(`🔄 ReaderSync: initializeContent(${totalPages} pages, ${totalUnits} units, ${toc.length} TOC entries)`);
    
    set((state) => ({
      ...state,
      totalPages,
      totalUnits,
      tableOfContents: toc,
    }));
    
    // Build chapter boundaries after setting TOC
    get().buildChapterBoundaries();
  },
  
  updateContentDensity: (page: number, density: ContentDensity) => {
    const state = get();
    const newMap = new Map(state.contentDensityMap);
    newMap.set(page, density);
    
    set({ contentDensityMap: newMap });
  },
  
  buildChapterBoundaries: () => {
    const state = get();
    const boundaries: ChapterBoundary[] = [];
    
    // Convert TOC entries to chapter boundaries
    const processTOCEntry = (entry: TOCEntry, level: number = 0) => {
      if (level === 0) { // Only top-level entries become chapter boundaries
        const unitsPerPage = state.totalUnits / Math.max(1, state.totalPages);
        const estimatedUnitStart = Math.max(1, Math.round((entry.pageNumber - 1) * unitsPerPage) + 1);
        
        boundaries.push({
          page: entry.pageNumber,
          unitStart: estimatedUnitStart,
          unitEnd: estimatedUnitStart + Math.round(unitsPerPage * 5), // Rough estimate
          title: entry.title,
          confidence: entry.confidence || 0.7
        });
      }
      
      // Process sub-chapters
      if (entry.subChapters) {
        entry.subChapters.forEach(sub => processTOCEntry(sub, level + 1));
      }
    };
    
    state.tableOfContents.forEach(entry => processTOCEntry(entry));
    
    // Sort by page and fix unit ranges
    boundaries.sort((a, b) => a.page - b.page);
    
    for (let i = 0; i < boundaries.length - 1; i++) {
      const current = boundaries[i];
      const next = boundaries[i + 1];
      current.unitEnd = Math.max(current.unitStart, next.unitStart - 1);
    }
    
    // Fix last chapter
    if (boundaries.length > 0) {
      boundaries[boundaries.length - 1].unitEnd = state.totalUnits;
    }
    
    console.log(`🔄 ReaderSync: Built ${boundaries.length} chapter boundaries`);
    set({ chapterBoundaries: boundaries });
  },
  
  // Whiteboard chapter animation methods
  setCurrentChapter: (chapterId: string | null) => {
    console.log(`🎨 ReaderSync: setCurrentChapter(${chapterId})`);
    set({ currentChapterId: chapterId });
  },
  
  getAnimationStep: (chapterId: string) => {
    const state = get();
    return state.chapterAnimationSteps.get(chapterId) || 0;
  },
  
  setAnimationStep: (chapterId: string, step: number) => {
    console.log(`🎨 ReaderSync: setAnimationStep(${chapterId}, ${step})`);
    const state = get();
    const newSteps = new Map(state.chapterAnimationSteps);
    newSteps.set(chapterId, step);
    set({ chapterAnimationSteps: newSteps });
  },
  
  cacheAnimationScript: (chapterId: string, script: any[]) => {
    console.log(`🎨 ReaderSync: cacheAnimationScript(${chapterId}, ${script.length} steps)`);
    const state = get();
    const newCache = new Map(state.animationScriptCache);
    newCache.set(chapterId, script);
    set({ animationScriptCache: newCache });
  },
  
  getAnimationScript: (chapterId: string) => {
    const state = get();
    return state.animationScriptCache.get(chapterId) || null;
  },
}));

// Helper functions
function getChapterPageSpan(chapter: ChapterBoundary, allChapters: ChapterBoundary[]): number {
  const nextChapter = allChapters.find(ch => ch.page > chapter.page);
  return nextChapter ? nextChapter.page - chapter.page : 10; // Default span
}

function findTOCEntry(toc: TOCEntry[], title: string): TOCEntry | null {
  const searchTitle = title.toLowerCase();
  
  for (const entry of toc) {
    if (entry.title.toLowerCase().includes(searchTitle) || 
        searchTitle.includes(entry.title.toLowerCase())) {
      return entry;
    }
    
    if (entry.subChapters) {
      const found = findTOCEntry(entry.subChapters, title);
      if (found) return found;
    }
  }
  
  return null;
}

// Enhanced helper function to create stable chunk IDs
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

// Content analysis helpers
export function analyzeContentDensity(text: string, pageNumber: number): ContentDensity {
  const wordCount = (text.match(/\b\w+\b/g) || []).length;
  const hasFormulas = /[∑∏∫√≈≠≤≥→↔⇌Δ±∞μ°Ωπθαβγλ]|\\[a-zA-Z]+\{/.test(text);
  const hasDiagrams = /\b(diagram|figure|fig\.|chart|graph|table|image)\b/i.test(text);
  
  // Calculate density based on content richness
  let density = Math.min(1, wordCount / 300); // Normalize to ~300 words per page
  if (hasFormulas) density += 0.2;
  if (hasDiagrams) density += 0.3;
  
  return {
    page: pageNumber,
    density: Math.min(1, density),
    hasFormulas,
    hasDiagrams,
    wordCount
  };
}
