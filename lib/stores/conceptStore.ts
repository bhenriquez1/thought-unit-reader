/**
 * Concept Store - Zustand store for Universal Thought-Unit Reader
 *
 * Manages extracted concepts per page with:
 * - Page-keyed concept storage
 * - Extraction status tracking
 * - View mode preferences (raw/filtered)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type ConceptOutput,
  type PageType,
  extractConcept,
  extractConceptsFromPage,
  classifyPageType,
} from '../universalExtractor';

// ============================================================================
// Types
// ============================================================================

export type ViewMode = 'filtered' | 'raw';
export type CardDisplayMode = 'compact' | 'expanded';

export interface PageConcepts {
  pageNumber: number;
  pageType: PageType;
  concepts: ConceptOutput[];
  extractedAt: number;
  textHash: string;
}

export interface ConceptStoreState {
  // Data
  conceptsByPage: Map<string, PageConcepts>;  // key = `${documentId}:${pageNumber}`
  currentDocumentId: string | null;

  // UI State
  viewMode: ViewMode;
  cardDisplayMode: CardDisplayMode;
  expandedExceptions: Set<string>;  // Set of concept IDs with expanded exceptions
  highlightedConceptId: string | null;

  // Extraction State
  isExtracting: boolean;
  extractionProgress: number;  // 0-100
  lastError: string | null;

  // Actions
  setCurrentDocument: (documentId: string) => void;
  extractForPage: (documentId: string, pageNumber: number, pageText: string) => Promise<ConceptOutput[]>;
  getConceptsForPage: (documentId: string, pageNumber: number) => PageConcepts | null;
  clearConceptsForDocument: (documentId: string) => void;

  // UI Actions
  setViewMode: (mode: ViewMode) => void;
  setCardDisplayMode: (mode: CardDisplayMode) => void;
  toggleExceptionExpanded: (conceptId: string) => void;
  setHighlightedConcept: (conceptId: string | null) => void;

  // Batch Operations
  extractForPages: (documentId: string, pages: Array<{ pageNumber: number; text: string }>) => Promise<void>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getPageKey(documentId: string, pageNumber: number): string {
  return `${documentId}:${pageNumber}`;
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Store
// ============================================================================

export const useConceptStore = create<ConceptStoreState>()(
  persist(
    (set, get) => ({
      // Initial State
      conceptsByPage: new Map(),
      currentDocumentId: null,
      viewMode: 'filtered',
      cardDisplayMode: 'compact',
      expandedExceptions: new Set(),
      highlightedConceptId: null,
      isExtracting: false,
      extractionProgress: 0,
      lastError: null,

      // Actions
      setCurrentDocument: (documentId) => {
        set({ currentDocumentId: documentId });
      },

      extractForPage: async (documentId, pageNumber, pageText) => {
        const key = getPageKey(documentId, pageNumber);
        const textHash = hashText(pageText);

        // Check cache - return existing if text hasn't changed
        const existing = get().conceptsByPage.get(key);
        if (existing && existing.textHash === textHash) {
          return existing.concepts;
        }

        set({ isExtracting: true, lastError: null });

        try {
          // Extract concepts
          const concepts = extractConceptsFromPage(pageText, pageNumber);
          const pageType = classifyPageType(pageText);

          const pageConcepts: PageConcepts = {
            pageNumber,
            pageType,
            concepts,
            extractedAt: Date.now(),
            textHash,
          };

          // Update store
          set((state) => {
            const newMap = new Map(state.conceptsByPage);
            newMap.set(key, pageConcepts);
            return {
              conceptsByPage: newMap,
              isExtracting: false,
            };
          });

          return concepts;
        } catch (error) {
          set({
            isExtracting: false,
            lastError: error instanceof Error ? error.message : 'Extraction failed',
          });
          return [];
        }
      },

      getConceptsForPage: (documentId, pageNumber) => {
        const key = getPageKey(documentId, pageNumber);
        return get().conceptsByPage.get(key) || null;
      },

      clearConceptsForDocument: (documentId) => {
        set((state) => {
          const newMap = new Map(state.conceptsByPage);
          // Remove all entries for this document
          for (const key of newMap.keys()) {
            if (key.startsWith(`${documentId}:`)) {
              newMap.delete(key);
            }
          }
          return { conceptsByPage: newMap };
        });
      },

      // UI Actions
      setViewMode: (mode) => {
        set({ viewMode: mode });
      },

      setCardDisplayMode: (mode) => {
        set({ cardDisplayMode: mode });
      },

      toggleExceptionExpanded: (conceptId) => {
        set((state) => {
          const newSet = new Set(state.expandedExceptions);
          if (newSet.has(conceptId)) {
            newSet.delete(conceptId);
          } else {
            newSet.add(conceptId);
          }
          return { expandedExceptions: newSet };
        });
      },

      setHighlightedConcept: (conceptId) => {
        set({ highlightedConceptId: conceptId });
      },

      // Batch Operations
      extractForPages: async (documentId, pages) => {
        set({ isExtracting: true, extractionProgress: 0, lastError: null });

        try {
          for (let i = 0; i < pages.length; i++) {
            const { pageNumber, text } = pages[i];
            await get().extractForPage(documentId, pageNumber, text);

            // Update progress
            set({ extractionProgress: Math.round(((i + 1) / pages.length) * 100) });
          }

          set({ isExtracting: false, extractionProgress: 100 });
        } catch (error) {
          set({
            isExtracting: false,
            lastError: error instanceof Error ? error.message : 'Batch extraction failed',
          });
        }
      },
    }),
    {
      name: 'concept-store',
      // Custom serializer for Map and Set
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const data = JSON.parse(str);
          // Restore Map from array
          if (data.state?.conceptsByPage) {
            data.state.conceptsByPage = new Map(data.state.conceptsByPage);
          }
          // Restore Set from array
          if (data.state?.expandedExceptions) {
            data.state.expandedExceptions = new Set(data.state.expandedExceptions);
          }
          return data;
        },
        setItem: (name, value) => {
          // Convert Map to array for serialization
          const toStore = {
            ...value,
            state: {
              ...value.state,
              conceptsByPage: Array.from(value.state.conceptsByPage.entries()),
              expandedExceptions: Array.from(value.state.expandedExceptions),
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

export const selectConceptsForCurrentPage = (
  state: ConceptStoreState,
  documentId: string,
  pageNumber: number
): ConceptOutput[] => {
  const pageConcepts = state.conceptsByPage.get(getPageKey(documentId, pageNumber));
  return pageConcepts?.concepts || [];
};

export const selectPageType = (
  state: ConceptStoreState,
  documentId: string,
  pageNumber: number
): PageType | null => {
  const pageConcepts = state.conceptsByPage.get(getPageKey(documentId, pageNumber));
  return pageConcepts?.pageType || null;
};

export const selectIsExceptionExpanded = (
  state: ConceptStoreState,
  conceptId: string
): boolean => {
  return state.expandedExceptions.has(conceptId);
};
