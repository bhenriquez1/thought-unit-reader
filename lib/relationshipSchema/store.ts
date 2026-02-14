// lib/relationshipSchema/store.ts
// Relationship-First Store for Surgeon View 2.0

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Concept,
  Relation,
  PatternCluster,
  PatternClusterKind,
  DecisionRule,
  Insight,
  CockpitViewData,
  ExtractionResult,
} from './types';
import { runRelationshipExtraction } from './extractor';

// ============================================================================
// Store State
// ============================================================================

interface RelationshipStoreState {
  // Document scope
  docId: string;

  // Primary data (in-memory)
  concepts: Record<string, Concept>;
  relations: Record<string, Relation>;
  clusters: Record<string, PatternCluster>;
  rules: Record<string, DecisionRule>;
  insights: Record<string, Insight>;

  // Extraction tracking
  extractedPages: Set<number>;
  isExtracting: boolean;
  extractionProgress: number;
  extractionError?: string;

  // UI state
  selectedClusterId?: string;
  selectedRelationId?: string;
  expandedClusterIds: Set<string>;
  expertModeEnabled: boolean;

  // Filters
  filterByKind?: PatternClusterKind;
  filterByConfidence: number;
}

interface RelationshipStoreActions {
  // Document
  setDocId: (docId: string) => void;
  reset: () => void;

  // Extraction
  extractFromPage: (text: string, pageIndex: number) => void;
  extractFromMultiplePages: (pages: { text: string; pageIndex: number }[]) => Promise<void>;

  // Manual additions
  addConcept: (concept: Concept) => void;
  addRelation: (relation: Relation) => void;
  addCluster: (cluster: PatternCluster) => void;
  addRule: (rule: DecisionRule) => void;
  updateRule: (ruleId: string, updates: Partial<DecisionRule>) => void;

  // Selection
  selectCluster: (clusterId: string | undefined) => void;
  selectRelation: (relationId: string | undefined) => void;
  toggleClusterExpanded: (clusterId: string) => void;

  // Expert mode
  toggleExpertMode: () => void;

  // Filters
  setFilterByKind: (kind: PatternClusterKind | undefined) => void;
  setFilterByConfidence: (confidence: number) => void;

  // Computed data
  getCockpitViewData: () => CockpitViewData;
  getRelationsForCluster: (clusterId: string) => Relation[];
  getConceptById: (conceptId: string) => Concept | undefined;
  getChainsFromCluster: (clusterId: string) => {
    id: string;
    title: string;
    relations: Relation[];
    concepts: Concept[];
  }[];
}

type RelationshipStore = RelationshipStoreState & RelationshipStoreActions;

// ============================================================================
// Default State
// ============================================================================

const defaultState: RelationshipStoreState = {
  docId: '',
  concepts: {},
  relations: {},
  clusters: {},
  rules: {},
  insights: {},
  extractedPages: new Set(),
  isExtracting: false,
  extractionProgress: 0,
  extractionError: undefined,
  expandedClusterIds: new Set(),
  expertModeEnabled: false,
  filterByConfidence: 0,
};

// ============================================================================
// Store Implementation
// ============================================================================

export const useRelationshipStore = create<RelationshipStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ========================================
      // Document
      // ========================================

      setDocId: (docId) => {
        const current = get().docId;
        if (current !== docId) {
          // Reset when document changes
          set({
            ...defaultState,
            docId,
          });
        }
      },

      reset: () => {
        set(defaultState);
      },

      // ========================================
      // Extraction
      // ========================================

      extractFromPage: (text, pageIndex) => {
        const { docId, extractedPages, concepts, relations, clusters, rules } = get();

        if (extractedPages.has(pageIndex)) return; // Already extracted

        set({ isExtracting: true });

        const result = runRelationshipExtraction(text, docId, pageIndex);

        // Merge results
        const newConcepts = { ...concepts };
        for (const c of result.concepts) {
          newConcepts[c.id] = c;
        }

        const newRelations = { ...relations };
        for (const r of result.relations) {
          newRelations[r.id] = r;
        }

        const newClusters = { ...clusters };
        for (const cl of result.clusters) {
          newClusters[cl.id] = cl;
        }

        const newRules = { ...rules };
        for (const r of result.rules) {
          newRules[r.id] = r;
        }

        const newExtractedPages = new Set(extractedPages);
        newExtractedPages.add(pageIndex);

        set({
          concepts: newConcepts,
          relations: newRelations,
          clusters: newClusters,
          rules: newRules,
          extractedPages: newExtractedPages,
          isExtracting: false,
        });
      },

      extractFromMultiplePages: async (pages) => {
        console.log('🔬 Store: Starting extraction for', pages.length, 'pages');
        set({ isExtracting: true, extractionProgress: 0, extractionError: undefined });

        try {
          const { docId, extractedPages, concepts, relations, clusters, rules } = get();

          const newConcepts = { ...concepts };
          const newRelations = { ...relations };
          const newClusters = { ...clusters };
          const newRules = { ...rules };
          const newExtractedPages = new Set(extractedPages);

          let totalExtracted = { concepts: 0, relations: 0, clusters: 0, rules: 0 };

          for (let i = 0; i < pages.length; i++) {
            const { text, pageIndex } = pages[i];

            if (newExtractedPages.has(pageIndex)) {
              console.log('🔬 Store: Skipping already extracted page', pageIndex);
              continue;
            }

            console.log('🔬 Store: Extracting page', pageIndex, '- text length:', text.length);

            const result = runRelationshipExtraction(text, docId || 'default', pageIndex);
            console.log('🔬 Store: Page', pageIndex, 'results:', {
              concepts: result.concepts.length,
              relations: result.relations.length,
              clusters: result.clusters.length,
              rules: result.rules.length,
            });

            for (const c of result.concepts) {
              newConcepts[c.id] = c;
              totalExtracted.concepts++;
            }
            for (const r of result.relations) {
              newRelations[r.id] = r;
              totalExtracted.relations++;
            }
            for (const cl of result.clusters) {
              newClusters[cl.id] = cl;
              totalExtracted.clusters++;
            }
            for (const r of result.rules) {
              newRules[r.id] = r;
              totalExtracted.rules++;
            }

            newExtractedPages.add(pageIndex);

            // Update progress incrementally
            set({
              concepts: newConcepts,
              relations: newRelations,
              clusters: newClusters,
              rules: newRules,
              extractionProgress: (i + 1) / pages.length,
            });
          }

          console.log('🔬 Store: Extraction complete. Total extracted:', totalExtracted);

          set({
            extractedPages: newExtractedPages,
            isExtracting: false,
            extractionProgress: 1,
            extractionError: undefined,
          });
        } catch (error) {
          console.error('🔬 Store: Extraction failed:', error);
          set({
            isExtracting: false,
            extractionProgress: 0,
            extractionError: error instanceof Error ? error.message : 'Extraction failed',
          });
          throw error;
        }
      },

      // ========================================
      // Manual Additions
      // ========================================

      addConcept: (concept) => {
        set((state) => ({
          concepts: { ...state.concepts, [concept.id]: concept },
        }));
      },

      addRelation: (relation) => {
        set((state) => ({
          relations: { ...state.relations, [relation.id]: relation },
        }));
      },

      addCluster: (cluster) => {
        set((state) => ({
          clusters: { ...state.clusters, [cluster.id]: cluster },
        }));
      },

      addRule: (rule) => {
        set((state) => ({
          rules: { ...state.rules, [rule.id]: rule },
        }));
      },

      updateRule: (ruleId, updates) => {
        set((state) => {
          const existing = state.rules[ruleId];
          if (!existing) return state;
          return {
            rules: {
              ...state.rules,
              [ruleId]: { ...existing, ...updates, updatedAt: Date.now() },
            },
          };
        });
      },

      // ========================================
      // Selection
      // ========================================

      selectCluster: (clusterId) => {
        set({ selectedClusterId: clusterId, selectedRelationId: undefined });
      },

      selectRelation: (relationId) => {
        set({ selectedRelationId: relationId });
      },

      toggleClusterExpanded: (clusterId) => {
        set((state) => {
          const expanded = new Set(state.expandedClusterIds);
          if (expanded.has(clusterId)) {
            expanded.delete(clusterId);
          } else {
            expanded.add(clusterId);
          }
          return { expandedClusterIds: expanded };
        });
      },

      // ========================================
      // Expert Mode
      // ========================================

      toggleExpertMode: () => {
        set((state) => ({ expertModeEnabled: !state.expertModeEnabled }));
      },

      // ========================================
      // Filters
      // ========================================

      setFilterByKind: (kind) => {
        set({ filterByKind: kind });
      },

      setFilterByConfidence: (confidence) => {
        set({ filterByConfidence: confidence });
      },

      // ========================================
      // Computed Data
      // ========================================

      getCockpitViewData: (): CockpitViewData => {
        const { concepts, relations, clusters, rules, filterByKind, filterByConfidence } = get();

        const conceptList = Object.values(concepts);
        const relationList = Object.values(relations).filter(r => r.confidence >= filterByConfidence);
        const clusterList = Object.values(clusters)
          .filter(c => c.confidence >= filterByConfidence)
          .filter(c => !filterByKind || c.kind === filterByKind);
        const ruleList = Object.values(rules);

        // Group clusters by kind
        const clustersByKind: Record<PatternClusterKind, PatternCluster[]> = {
          process: [],
          causal: [],
          diagnostic: [],
          risk: [],
          exception: [],
        };

        for (const cluster of clusterList) {
          clustersByKind[cluster.kind].push(cluster);
        }

        const clusterGroups = (Object.entries(clustersByKind) as [PatternClusterKind, PatternCluster[]][])
          .filter(([_, list]) => list.length > 0)
          .map(([kind, list]) => ({
            kind,
            clusters: list.sort((a, b) => b.confidence - a.confidence),
            relationCount: list.reduce((sum, c) => sum + c.relationIds.length, 0),
          }));

        // Get relations with concepts
        const activeRelations = relationList.map(r => ({
          relation: r,
          subject: concepts[r.subjId]!,
          object: concepts[r.objId]!,
          confidence: r.confidence,
        })).filter(r => r.subject && r.object);

        // Calculate stats
        const allConfidences = relationList.map(r => r.confidence);
        const avgConfidence = allConfidences.length > 0
          ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
          : 0;

        return {
          clusterGroups,
          activeRelations,
          chains: [], // TODO: Implement chain detection
          totalConcepts: conceptList.length,
          totalRelations: relationList.length,
          totalClusters: clusterList.length,
          totalRules: ruleList.length,
          avgConfidence,
        };
      },

      getRelationsForCluster: (clusterId) => {
        const { clusters, relations } = get();
        const cluster = clusters[clusterId];
        if (!cluster) return [];
        return cluster.relationIds
          .map(id => relations[id])
          .filter(Boolean);
      },

      getConceptById: (conceptId) => {
        return get().concepts[conceptId];
      },

      getChainsFromCluster: (clusterId) => {
        const { clusters, relations, concepts } = get();
        const cluster = clusters[clusterId];
        if (!cluster) return [];

        const clusterRelations = cluster.relationIds
          .map(id => relations[id])
          .filter(Boolean);

        // Simple chain: group relations that share subject/object
        const chains: {
          id: string;
          title: string;
          relations: Relation[];
          concepts: Concept[];
        }[] = [];

        // Build adjacency
        const graph = new Map<string, Relation[]>();
        for (const rel of clusterRelations) {
          const existing = graph.get(rel.subjId) || [];
          existing.push(rel);
          graph.set(rel.subjId, existing);
        }

        // Find chains starting from each concept
        const visited = new Set<string>();
        for (const [startId, startRels] of graph) {
          if (visited.has(startId)) continue;

          const chainRelations: Relation[] = [];
          const chainConcepts: Concept[] = [];
          const queue = [startId];

          while (queue.length > 0) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);

            const concept = concepts[current];
            if (concept) chainConcepts.push(concept);

            const outgoing = graph.get(current) || [];
            for (const rel of outgoing) {
              if (!chainRelations.includes(rel)) {
                chainRelations.push(rel);
                queue.push(rel.objId);
              }
            }
          }

          if (chainRelations.length >= 2) {
            chains.push({
              id: `chain_${startId}`,
              title: `${concepts[startId]?.label || 'Unknown'} chain`,
              relations: chainRelations,
              concepts: chainConcepts,
            });
          }
        }

        return chains;
      },
    }),
    {
      name: 'relationship-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return localStorage;
      }),
      // Only persist UI state, NOT data (too large)
      partialize: (state) => ({
        docId: state.docId,
        expertModeEnabled: state.expertModeEnabled,
        filterByKind: state.filterByKind,
        filterByConfidence: state.filterByConfidence,
        // Convert Set to Array for JSON
        extractedPages: Array.from(state.extractedPages),
      }),
      // Hydrate Sets
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Convert arrays back to Sets
          state.extractedPages = new Set(state.extractedPages as unknown as number[]);
          state.expandedClusterIds = new Set();
        }
      },
    }
  )
);

export default useRelationshipStore;
