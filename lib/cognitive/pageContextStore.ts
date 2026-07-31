// lib/cognitive/pageContextStore.ts
// PageContext Store - Single Source of Truth for Page Navigation
// Updated by: PDF scroll, page navigation, TOC jump

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  PageContext,
  DocId,
  PageIndex,
  ChapterId,
  TocNodeId,
  TocNode,
  ExtractionMode,
} from './types';
import { useCurrentLearningContext } from '../context/learningContext';

// ============================================================================
// State Interface
// ============================================================================

interface PageContextState {
  // Current page context
  context: PageContext;

  // TOC data for chapter matching
  tocNodes: TocNode[];

  // Extraction mode preference
  extractionMode: ExtractionMode;

  // Chapter range for "current chapter" mode
  currentChapterRange?: { start: PageIndex; end: PageIndex };
}

interface PageContextActions {
  // Update page context from any source
  setPage: (pageIndex: PageIndex, source?: 'scroll' | 'navigation' | 'toc_jump') => void;
  setDocument: (docId: DocId, totalPages: number) => void;
  setTocNodes: (nodes: TocNode[]) => void;

  // Extraction mode
  setExtractionMode: (mode: ExtractionMode) => void;

  // Getters
  getPageContext: () => PageContext;
  getCurrentChapterNodes: () => TocNode[];
  getChapterForPage: (pageIndex: PageIndex) => TocNode | undefined;
  getChapterRange: (pageIndex: PageIndex) => { start: PageIndex; end: PageIndex } | undefined;

  // Reset
  reset: () => void;
}

type PageContextStore = PageContextState & PageContextActions;

// ============================================================================
// Helpers
// ============================================================================

function findChapterForPage(nodes: TocNode[], pageIndex: PageIndex): TocNode | undefined {
  // Find the deepest matching node (most specific chapter/section)
  let bestMatch: TocNode | undefined;
  let bestLevel = -1;

  function traverse(node: TocNode) {
    const pageStart = node.pageStart;
    const pageEnd = node.pageEnd ?? (node.children?.length ?
      Math.max(...node.children.map(c => c.pageEnd ?? c.pageStart)) :
      pageStart);

    if (pageIndex >= pageStart && pageIndex <= pageEnd) {
      if (node.level > bestLevel) {
        bestMatch = node;
        bestLevel = node.level;
      }
      // Check children for more specific match
      if (node.children) {
        for (const child of node.children) {
          traverse(child);
        }
      }
    }
  }

  for (const node of nodes) {
    traverse(node);
  }

  return bestMatch;
}

function getChapterRangeForPage(nodes: TocNode[], pageIndex: PageIndex): { start: PageIndex; end: PageIndex } | undefined {
  // Find the chapter (level 1) containing this page
  for (const node of nodes) {
    if (node.level === 1 || node.level === 0) {
      const pageEnd = node.pageEnd ?? (
        // Find next chapter's start - 1
        nodes.filter(n => n.pageStart > node.pageStart)
          .sort((a, b) => a.pageStart - b.pageStart)[0]?.pageStart - 1
      );

      if (pageIndex >= node.pageStart && (!pageEnd || pageIndex <= pageEnd)) {
        return {
          start: node.pageStart,
          end: pageEnd ?? node.pageStart,
        };
      }
    }
  }
  return undefined;
}

function computeTocPath(nodes: TocNode[], pageIndex: PageIndex): PageContext['tocPath'] {
  const chapter = findChapterForPage(nodes, pageIndex);
  if (!chapter) return undefined;

  return {
    chapterId: chapter.id,
    tocNodeId: chapter.id,
    title: chapter.title,
  };
}

function computeConfidence(nodes: TocNode[], pageIndex: PageIndex): number {
  const chapter = findChapterForPage(nodes, pageIndex);
  if (!chapter) return 0;

  // Higher confidence if page is clearly within chapter range
  const pageStart = chapter.pageStart;
  const pageEnd = chapter.pageEnd ?? pageStart;

  if (pageIndex === pageStart) return 1.0; // Exact chapter start
  if (pageEnd && pageIndex <= pageEnd) return 0.9; // Within explicit range
  return 0.7; // Inferred range
}

// ============================================================================
// Default State
// ============================================================================

const defaultContext: PageContext = {
  docId: '',
  pageIndex: 0,
  totalPages: 0,
  confidence: 0,
  updatedAt: Date.now(),
};

const defaultState: PageContextState = {
  context: defaultContext,
  tocNodes: [],
  extractionMode: 'current_page',
  currentChapterRange: undefined,
};

// ============================================================================
// Store
// ============================================================================

export const usePageContextStore = create<PageContextStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      setPage: (pageIndex, source) => {
        const { tocNodes, context } = get();
        const tocPath = computeTocPath(tocNodes, pageIndex);
        const confidence = computeConfidence(tocNodes, pageIndex);
        const chapterRange = getChapterRangeForPage(tocNodes, pageIndex);

        set({
          context: {
            ...context,
            pageIndex,
            tocPath,
            confidence,
            updatedAt: Date.now(),
          },
          currentChapterRange: chapterRange,
        });
      },

      setDocument: (docId, totalPages) => {
        set({
          context: {
            docId,
            pageIndex: 0,
            totalPages,
            confidence: 0,
            updatedAt: Date.now(),
          },
        });
      },

      setTocNodes: (nodes) => {
        const { context } = get();
        const tocPath = computeTocPath(nodes, context.pageIndex);
        const confidence = computeConfidence(nodes, context.pageIndex);
        const chapterRange = getChapterRangeForPage(nodes, context.pageIndex);

        set({
          tocNodes: nodes,
          context: {
            ...context,
            tocPath,
            confidence,
            updatedAt: Date.now(),
          },
          currentChapterRange: chapterRange,
        });
      },

      setExtractionMode: (mode) => {
        set({ extractionMode: mode });
      },

      getPageContext: () => get().context,

      getCurrentChapterNodes: () => {
        const { tocNodes, context } = get();
        const chapter = findChapterForPage(tocNodes, context.pageIndex);
        if (!chapter) return [];

        // Return this chapter and its children
        const result: TocNode[] = [chapter];
        if (chapter.children) {
          result.push(...chapter.children);
        }
        return result;
      },

      getChapterForPage: (pageIndex) => {
        return findChapterForPage(get().tocNodes, pageIndex);
      },

      getChapterRange: (pageIndex) => {
        return getChapterRangeForPage(get().tocNodes, pageIndex);
      },

      reset: () => {
        set(defaultState);
      },
    }),
    {
      name: 'page-context-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        extractionMode: state.extractionMode,
      }),
    }
  )
);

// Phase 2 One Brain: auto-sync page + document from CurrentLearningContext.
if (typeof window !== 'undefined') {
  useCurrentLearningContext.subscribe((state, prev) => {
    const store = usePageContextStore.getState();
    if (state.documentId !== prev.documentId || state.totalPages !== prev.totalPages) {
      if (state.documentId) store.setDocument(state.documentId, state.totalPages);
    }
    if (state.currentPage !== prev.currentPage) {
      store.setPage(state.currentPage);
    }
  });
}

export default usePageContextStore;
