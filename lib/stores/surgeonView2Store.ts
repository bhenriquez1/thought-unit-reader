// lib/stores/surgeonView2Store.ts
// Surgeon View 2.0 State Management
// Handles concepts, clusters, pearls, filters, and drawer state

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  CoreConceptV2,
  ConceptCluster,
  Pearl,
  ViewFilters,
  DrawerState,
  DrawerTab,
  SourceAnchor,
  ConceptTag,
  ConceptPriority,
  ViewMode,
  DATLens,
  ReasoningOverlay,
  ReasoningLens,
} from '../surgeonView2/types';
import { clusterConcepts, detectPearls } from '../surgeonView2/clustering';

// ============================================================================
// Cache Types
// ============================================================================

interface PageCache {
  concepts: CoreConceptV2[];
  clusters: ConceptCluster[];
  pearls: Pearl[];
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Store State Interface
// ============================================================================

interface SurgeonView2State {
  // Document
  documentId: string | null;
  currentPage: number;

  // Concepts & Clustering
  concepts: CoreConceptV2[];
  clusters: ConceptCluster[];
  pearls: Pearl[];

  // Selection & Navigation
  selectedConceptId: string | null;
  selectedPearlId: string | null;
  highlightedAnchor: SourceAnchor | null;

  // Filters
  filters: ViewFilters;

  // Drawer
  drawer: DrawerState;

  // Reasoning overlays
  reasoningOverlays: Record<string, ReasoningOverlay>;

  // Extraction status
  isExtracting: boolean;
  extractionProgress: number;

  // Per-page cache
  pageCache: Record<string, PageCache>;

  // Actions
  setDocument: (documentId: string) => void;
  setCurrentPage: (page: number) => void;

  // Concept management
  setConcepts: (concepts: CoreConceptV2[], pageNumber: number) => void;
  addConcept: (concept: CoreConceptV2) => void;
  updateConceptTags: (conceptId: string, tags: ConceptTag[]) => void;
  updateConceptPriority: (conceptId: string, priority: ConceptPriority) => void;

  // Cluster management
  toggleCluster: (clusterId: string) => void;

  // Selection
  selectConcept: (conceptId: string | null) => void;
  selectPearl: (pearlId: string | null) => void;
  setHighlightedAnchor: (anchor: SourceAnchor | null) => void;
  jumpToSource: (anchor: SourceAnchor) => void;

  // Filters
  setViewMode: (mode: ViewMode) => void;
  setDATLens: (lens: DATLens | undefined) => void;
  toggleHighYieldOnly: () => void;
  toggleShowPearls: () => void;
  toggleShowDefinitions: () => void;
  toggleShowProcesses: () => void;
  toggleShowExamples: () => void;
  setPriorityFilter: (priorities: ConceptPriority[]) => void;
  resetFilters: () => void;

  // Drawer
  openDrawer: (tab?: DrawerTab) => void;
  closeDrawer: () => void;
  setDrawerTab: (tab: DrawerTab) => void;

  // Reasoning
  setReasoningOverlay: (conceptId: string, overlay: ReasoningOverlay) => void;
  getReasoningOverlay: (conceptId: string) => ReasoningOverlay | null;

  // Extraction
  setExtracting: (isExtracting: boolean, progress?: number) => void;

  // Cache
  getCachedPage: (documentId: string, pageNumber: number) => PageCache | null;
  clearCache: (documentId?: string) => void;

  // Filtered getters
  getFilteredConcepts: () => CoreConceptV2[];
  getVisiblePearls: () => Pearl[];
  getConceptById: (id: string) => CoreConceptV2 | undefined;
  getPearlById: (id: string) => Pearl | undefined;
}

// ============================================================================
// Default Filter State
// ============================================================================

const defaultFilters: ViewFilters = {
  mode: 'study',
  datLens: undefined,
  highYieldOnly: false,
  showPearls: true,
  showDefinitions: true,
  showProcesses: true,
  showExamples: true,
  priorityFilter: ['high', 'medium', 'low'],
};

const defaultDrawer: DrawerState = {
  isOpen: false,
  activeTab: 'source',
  selectedConceptId: null,
  selectedPearlId: null,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useSurgeonView2Store = create<SurgeonView2State>()(
  persist(
    (set, get) => ({
      // Initial state
      documentId: null,
      currentPage: 1,
      concepts: [],
      clusters: [],
      pearls: [],
      selectedConceptId: null,
      selectedPearlId: null,
      highlightedAnchor: null,
      filters: defaultFilters,
      drawer: defaultDrawer,
      reasoningOverlays: {},
      isExtracting: false,
      extractionProgress: 0,
      pageCache: {},

      // Document management
      setDocument: (documentId: string) => {
        set({ documentId, currentPage: 1, concepts: [], clusters: [], pearls: [] });
      },

      setCurrentPage: (page: number) => {
        const { documentId, pageCache } = get();

        // Check cache first
        if (documentId) {
          const cached = get().getCachedPage(documentId, page);
          if (cached) {
            set({
              currentPage: page,
              concepts: cached.concepts,
              clusters: cached.clusters,
              pearls: cached.pearls,
            });
            return;
          }
        }

        // Clear current concepts when no cache
        set({
          currentPage: page,
          concepts: [],
          clusters: [],
          pearls: [],
          selectedConceptId: null,
          selectedPearlId: null,
        });
      },

      // Concept management
      setConcepts: (concepts: CoreConceptV2[], pageNumber: number) => {
        const { documentId } = get();

        // Auto-cluster concepts
        const clusters = clusterConcepts(concepts);

        // Auto-detect pearls from concept text
        const allText = concepts.map(c => c.sourceExcerpt).join('\n');
        const pearls = detectPearls(allText, pageNumber);

        // Update state
        set({ concepts, clusters, pearls });

        // Cache results
        if (documentId) {
          const cacheKey = `${documentId}_${pageNumber}`;
          set((state) => ({
            pageCache: {
              ...state.pageCache,
              [cacheKey]: {
                concepts,
                clusters,
                pearls,
                timestamp: Date.now(),
              },
            },
          }));
        }
      },

      addConcept: (concept: CoreConceptV2) => {
        set((state) => ({
          concepts: [...state.concepts, concept],
        }));

        // Re-cluster
        const { concepts } = get();
        const clusters = clusterConcepts(concepts);
        set({ clusters });
      },

      updateConceptTags: (conceptId: string, tags: ConceptTag[]) => {
        set((state) => ({
          concepts: state.concepts.map((c) =>
            c.id === conceptId ? { ...c, tags } : c
          ),
        }));
      },

      updateConceptPriority: (conceptId: string, priority: ConceptPriority) => {
        set((state) => ({
          concepts: state.concepts.map((c) =>
            c.id === conceptId ? { ...c, priority } : c
          ),
        }));
      },

      // Cluster management
      toggleCluster: (clusterId: string) => {
        set((state) => ({
          clusters: state.clusters.map((c) =>
            c.id === clusterId ? { ...c, collapsed: !c.collapsed } : c
          ),
        }));
      },

      // Selection
      selectConcept: (conceptId: string | null) => {
        const concept = conceptId ? get().getConceptById(conceptId) : null;

        set({
          selectedConceptId: conceptId,
          selectedPearlId: null,
          highlightedAnchor: concept?.anchor || null,
          drawer: {
            ...get().drawer,
            selectedConceptId: conceptId,
            selectedPearlId: null,
          },
        });
      },

      selectPearl: (pearlId: string | null) => {
        const pearl = pearlId ? get().getPearlById(pearlId) : null;

        set({
          selectedPearlId: pearlId,
          selectedConceptId: null,
          highlightedAnchor: pearl?.anchor || null,
          drawer: {
            ...get().drawer,
            selectedPearlId: pearlId,
            selectedConceptId: null,
          },
        });
      },

      setHighlightedAnchor: (anchor: SourceAnchor | null) => {
        set({ highlightedAnchor: anchor });
      },

      jumpToSource: (anchor: SourceAnchor) => {
        set({
          highlightedAnchor: anchor,
          currentPage: anchor.pageIndex + 1, // Convert 0-based to 1-based
        });
      },

      // Filter management
      setViewMode: (mode: ViewMode) => {
        set((state) => ({
          filters: { ...state.filters, mode },
        }));
      },

      setDATLens: (lens: DATLens | undefined) => {
        set((state) => ({
          filters: { ...state.filters, datLens: lens },
        }));
      },

      toggleHighYieldOnly: () => {
        set((state) => ({
          filters: { ...state.filters, highYieldOnly: !state.filters.highYieldOnly },
        }));
      },

      toggleShowPearls: () => {
        set((state) => ({
          filters: { ...state.filters, showPearls: !state.filters.showPearls },
        }));
      },

      toggleShowDefinitions: () => {
        set((state) => ({
          filters: { ...state.filters, showDefinitions: !state.filters.showDefinitions },
        }));
      },

      toggleShowProcesses: () => {
        set((state) => ({
          filters: { ...state.filters, showProcesses: !state.filters.showProcesses },
        }));
      },

      toggleShowExamples: () => {
        set((state) => ({
          filters: { ...state.filters, showExamples: !state.filters.showExamples },
        }));
      },

      setPriorityFilter: (priorities: ConceptPriority[]) => {
        set((state) => ({
          filters: { ...state.filters, priorityFilter: priorities },
        }));
      },

      resetFilters: () => {
        set({ filters: defaultFilters });
      },

      // Drawer management
      openDrawer: (tab?: DrawerTab) => {
        set((state) => ({
          drawer: {
            ...state.drawer,
            isOpen: true,
            activeTab: tab || state.drawer.activeTab,
          },
        }));
      },

      closeDrawer: () => {
        set((state) => ({
          drawer: { ...state.drawer, isOpen: false },
        }));
      },

      setDrawerTab: (tab: DrawerTab) => {
        set((state) => ({
          drawer: { ...state.drawer, activeTab: tab },
        }));
      },

      // Reasoning overlays
      setReasoningOverlay: (conceptId: string, overlay: ReasoningOverlay) => {
        set((state) => ({
          reasoningOverlays: {
            ...state.reasoningOverlays,
            [conceptId]: overlay,
          },
        }));
      },

      getReasoningOverlay: (conceptId: string) => {
        return get().reasoningOverlays[conceptId] || null;
      },

      // Extraction status
      setExtracting: (isExtracting: boolean, progress?: number) => {
        set({
          isExtracting,
          extractionProgress: progress ?? (isExtracting ? 0 : 100),
        });
      },

      // Cache management
      getCachedPage: (documentId: string, pageNumber: number) => {
        const cacheKey = `${documentId}_${pageNumber}`;
        const cached = get().pageCache[cacheKey];

        if (!cached) return null;

        // Check TTL
        if (Date.now() - cached.timestamp > CACHE_TTL) {
          // Expired - clean up
          set((state) => {
            const { [cacheKey]: _, ...rest } = state.pageCache;
            return { pageCache: rest };
          });
          return null;
        }

        return cached;
      },

      clearCache: (documentId?: string) => {
        if (documentId) {
          // Clear specific document
          set((state) => {
            const newCache: Record<string, PageCache> = {};
            for (const key in state.pageCache) {
              if (!key.startsWith(`${documentId}_`)) {
                newCache[key] = state.pageCache[key];
              }
            }
            return { pageCache: newCache };
          });
        } else {
          // Clear all
          set({ pageCache: {} });
        }
      },

      // Filtered getters
      getFilteredConcepts: () => {
        const { concepts, filters } = get();

        return concepts.filter((concept) => {
          // Priority filter
          if (!filters.priorityFilter.includes(concept.priority)) {
            return false;
          }

          // High-yield only
          if (filters.highYieldOnly && concept.priority !== 'high') {
            return false;
          }

          // Tag filters
          if (!filters.showDefinitions && concept.tags.includes('definition')) {
            return false;
          }
          if (!filters.showProcesses && concept.tags.includes('process')) {
            return false;
          }
          if (!filters.showExamples && concept.tags.includes('example')) {
            return false;
          }

          return true;
        });
      },

      getVisiblePearls: () => {
        const { pearls, filters } = get();

        if (!filters.showPearls) return [];

        return pearls.filter((pearl) => {
          if (filters.highYieldOnly && pearl.priority !== 'high') {
            return false;
          }
          return true;
        });
      },

      getConceptById: (id: string) => {
        return get().concepts.find((c) => c.id === id);
      },

      getPearlById: (id: string) => {
        return get().pearls.find((p) => p.id === id);
      },
    }),
    {
      name: 'surgeon-view-2-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      partialize: (state) => ({
        filters: state.filters,
        reasoningOverlays: state.reasoningOverlays,
      }),
      skipHydration: typeof window === 'undefined',
    }
  )
);

export default useSurgeonView2Store;
