// lib/surgeonEngine/store.ts
// Zustand Store for Surgeon Engine
// Orchestrates all 5 engines + Expert View payload

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  SurgeonEngineState,
  ExtractedUnit,
  ImportanceScore,
  ImportanceItem,
  TrapTag,
  TrapSignal,
  Pattern,
  PatternCluster,
  ClinicalScaffold,
  ClinicalFlow,
  SyllabusItem,
  SyllabusUnit,
  SyllabusMappingResult,
  MatchResult,
  UserTrainingSignal,
  TocNode,
  ExpertViewPayload,
  ExplainPlan,
  ExamDomain,
  ID,
  PageIndex,
  ChapterId,
} from './types';
import { scoreAllUnits, rankUnits } from './importanceEngine';
import { detectAllTraps } from './trapDetector';
import { runPatternPipeline } from './patternEngine';
import { buildScaffoldFromCluster, buildScaffoldFromUnit, isScaffoldMeaningful } from './clinicalScaffold';
import { runSyllabusMatchingPipeline, applyTrainingSignal } from './syllabusMatchingEngine';
import { buildExpertViewPayload } from './expertViewPayload';

// ============================================================================
// Store Actions
// ============================================================================

interface SurgeonEngineActions {
  // Setup
  setBook: (bookId: ID, domain: ExamDomain) => void;
  setTocNodes: (nodes: TocNode[]) => void;

  // Page context - single source of truth
  setPageContext: (pageIndex: PageIndex, chapterId?: ChapterId, selection?: string) => void;

  // Unit management
  addUnits: (units: ExtractedUnit[]) => void;
  clearUnits: () => void;

  // Engine execution
  runImportanceEngine: () => void;
  runTrapDetection: () => void;
  runPatternEngine: () => void;
  runAllEngines: () => void;

  // Scaffold
  generateScaffoldForCluster: (clusterId: ID) => void;
  generateScaffoldForUnit: (unitId: ID) => void;

  // Syllabus
  setSyllabusItems: (items: SyllabusItem[]) => void;
  setSyllabusUnits: (units: SyllabusUnit[]) => void;
  runSyllabusMatching: () => void;
  acceptMapping: (syllabusId: ID, candidateIndex: number) => void;
  rejectMapping: (syllabusId: ID, candidateIndex: number) => void;
  teachMapping: (syllabusId: ID, candidateIndex: number, notes?: string) => void;

  // UI
  selectCluster: (clusterId: ID | undefined) => void;
  selectUnit: (unitId: ID | undefined) => void;
  setActiveMode: (mode: 'priority' | 'explain' | 'compare' | 'insights') => void;

  // Payload
  getExpertViewPayload: (page: number) => ExpertViewPayload;
  getRankedUnits: () => ImportanceScore[];
  getImportanceItems: () => ImportanceItem[];

  // Reset
  reset: () => void;
}

type SurgeonEngineStore = SurgeonEngineState & SurgeonEngineActions;

// ============================================================================
// Default State
// ============================================================================

const defaultState: SurgeonEngineState = {
  bookId: '',
  domain: 'DENTAL',

  // Page context - single source of truth
  currentPageIndex: 0,
  currentChapterId: undefined,
  currentSelection: undefined,

  // Units
  units: {},

  // Engine outputs
  importanceScores: {},
  importanceItems: [],
  trapTags: {},
  trapSignals: [],
  patterns: {},
  patternClusters: {},
  scaffolds: {},
  clinicalFlows: {},

  // Syllabus
  syllabusItems: [],
  syllabusUnits: [],
  syllabusResults: {},
  matchResults: [],
  trainingSignals: [],

  // TOC
  tocNodes: [],

  // Explain/Whiteboard
  explainPlans: {},
  activeExplainPlanId: undefined,

  // UI state
  selectedClusterId: undefined,
  selectedUnitId: undefined,
  activeScaffoldId: undefined,
  activeMode: 'priority',

  // Processing
  isProcessing: false,
  processingStep: undefined,
};

// ============================================================================
// Store
// ============================================================================

export const useSurgeonEngineStore = create<SurgeonEngineStore>()(
  persist(
    (set, get) => ({
      ...defaultState,

      // ============================
      // Setup
      // ============================

      setBook: (bookId, domain) => {
        const current = get().bookId;
        if (current !== bookId) {
          set({ ...defaultState, bookId, domain });
        } else {
          set({ domain });
        }
      },

      setTocNodes: (nodes) => {
        set({ tocNodes: nodes });
      },

      // ============================
      // Page Context - Single Source of Truth
      // ============================

      setPageContext: (pageIndex, chapterId, selection) => {
        set({
          currentPageIndex: pageIndex,
          currentChapterId: chapterId,
          currentSelection: selection,
        });
      },

      // ============================
      // Unit Management
      // ============================

      addUnits: (units) => {
        set((state) => {
          const newUnits = { ...state.units };
          for (const unit of units) {
            newUnits[unit.unitId] = unit;
          }
          return { units: newUnits };
        });
      },

      clearUnits: () => {
        set({
          units: {},
          importanceScores: {},
          trapTags: {},
          patterns: {},
          patternClusters: {},
          scaffolds: {},
        });
      },

      // ============================
      // Engine Execution
      // ============================

      runImportanceEngine: () => {
        const { units, domain, tocNodes } = get();
        const unitList = Object.values(units);
        if (unitList.length === 0) return;

        set({ isProcessing: true, processingStep: 'Scoring importance...' });

        const scores = scoreAllUnits(unitList, domain, { tocNodes });

        set({ importanceScores: scores, isProcessing: false, processingStep: undefined });
      },

      runTrapDetection: () => {
        const { units } = get();
        const unitList = Object.values(units);
        if (unitList.length === 0) return;

        set({ isProcessing: true, processingStep: 'Detecting traps...' });

        const traps = detectAllTraps(unitList);

        set({ trapTags: traps, isProcessing: false, processingStep: undefined });
      },

      runPatternEngine: () => {
        const { units, bookId } = get();
        const unitList = Object.values(units);
        if (unitList.length === 0) return;

        set({ isProcessing: true, processingStep: 'Extracting patterns...' });

        const { patterns, clusters } = runPatternPipeline(unitList, bookId);

        const patternMap: Record<ID, Pattern> = {};
        for (const p of patterns) {
          patternMap[p.patternId] = p;
        }

        const clusterMap: Record<ID, PatternCluster> = {};
        for (const c of clusters) {
          clusterMap[c.clusterId] = c;
        }

        set({
          patterns: patternMap,
          patternClusters: clusterMap,
          isProcessing: false,
          processingStep: undefined,
        });
      },

      runAllEngines: () => {
        const store = get();
        store.runImportanceEngine();
        store.runTrapDetection();
        store.runPatternEngine();
      },

      // ============================
      // Scaffold
      // ============================

      generateScaffoldForCluster: (clusterId) => {
        const { patternClusters, units, patterns, bookId } = get();
        const cluster = patternClusters[clusterId];
        if (!cluster) return;

        const scaffold = buildScaffoldFromCluster(cluster, units, patterns, bookId);

        if (isScaffoldMeaningful(scaffold)) {
          set((state) => ({
            scaffolds: { ...state.scaffolds, [scaffold.scaffoldId]: scaffold },
            activeScaffoldId: scaffold.scaffoldId,
          }));
        }
      },

      generateScaffoldForUnit: (unitId) => {
        const { units, patterns, bookId } = get();
        const unit = units[unitId];
        if (!unit) return;

        // Find patterns related to this unit
        const unitPatterns = Object.values(patterns).filter(
          p => p.evidence.some(e => e.unitId === unitId)
        );

        const scaffold = buildScaffoldFromUnit(unit, unitPatterns, bookId);

        if (isScaffoldMeaningful(scaffold)) {
          set((state) => ({
            scaffolds: { ...state.scaffolds, [scaffold.scaffoldId]: scaffold },
            activeScaffoldId: scaffold.scaffoldId,
          }));
        }
      },

      // ============================
      // Syllabus
      // ============================

      setSyllabusItems: (items) => {
        set({ syllabusItems: items });
      },

      setSyllabusUnits: (units) => {
        set({ syllabusUnits: units });
      },

      runSyllabusMatching: () => {
        const { syllabusItems, tocNodes, units, bookId, trainingSignals } = get();
        if (syllabusItems.length === 0 || tocNodes.length === 0) return;

        set({ isProcessing: true, processingStep: 'Matching syllabus...' });

        const unitList = Object.values(units);
        const results = runSyllabusMatchingPipeline(
          syllabusItems,
          tocNodes,
          unitList,
          bookId,
          trainingSignals
        );

        set({
          syllabusResults: results,
          isProcessing: false,
          processingStep: undefined,
        });
      },

      acceptMapping: (syllabusId, candidateIndex) => {
        set((state) => {
          const result = state.syllabusResults[syllabusId];
          if (!result || !result.candidates[candidateIndex]) return state;

          const chosen = result.candidates[candidateIndex];
          return {
            syllabusResults: {
              ...state.syllabusResults,
              [syllabusId]: {
                ...result,
                chosen,
                needsReview: false,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      rejectMapping: (syllabusId, candidateIndex) => {
        set((state) => {
          const result = state.syllabusResults[syllabusId];
          if (!result) return state;

          const newCandidates = result.candidates.filter((_, i) => i !== candidateIndex);
          return {
            syllabusResults: {
              ...state.syllabusResults,
              [syllabusId]: {
                ...result,
                candidates: newCandidates,
                chosen: result.chosen?.confidence === result.candidates[candidateIndex]?.confidence
                  ? undefined
                  : result.chosen,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      },

      teachMapping: (syllabusId, candidateIndex, notes) => {
        const state = get();
        const result = state.syllabusResults[syllabusId];
        if (!result || !result.candidates[candidateIndex]) return;

        const accepted = result.candidates[candidateIndex];
        const rejected = result.candidates.filter((_, i) => i !== candidateIndex);

        const signal: UserTrainingSignal = {
          syllabusId,
          bookId: state.bookId,
          acceptedCandidate: accepted,
          rejectedCandidates: rejected,
          notes,
          createdAt: new Date().toISOString(),
        };

        const updatedSignals = applyTrainingSignal(signal, state.trainingSignals);

        set({
          trainingSignals: updatedSignals,
          syllabusResults: {
            ...state.syllabusResults,
            [syllabusId]: {
              ...result,
              chosen: accepted,
              needsReview: false,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      },

      // ============================
      // UI
      // ============================

      selectCluster: (clusterId) => {
        set({ selectedClusterId: clusterId });
        if (clusterId) {
          get().generateScaffoldForCluster(clusterId);
        }
      },

      selectUnit: (unitId) => {
        set({ selectedUnitId: unitId });
      },

      setActiveMode: (mode) => {
        set({ activeMode: mode });
      },

      // ============================
      // Payload
      // ============================

      getExpertViewPayload: (page) => {
        const {
          bookId,
          units,
          importanceScores,
          trapTags,
          patterns,
          patternClusters,
          scaffolds,
          activeScaffoldId,
        } = get();

        return buildExpertViewPayload(
          page,
          bookId,
          units,
          importanceScores,
          trapTags,
          patterns,
          Object.values(patternClusters),
          activeScaffoldId ? scaffolds[activeScaffoldId] : undefined
        );
      },

      getRankedUnits: () => {
        return rankUnits(get().importanceScores);
      },

      getImportanceItems: () => {
        return get().importanceItems;
      },

      // ============================
      // Reset
      // ============================

      reset: () => {
        set(defaultState);
      },
    }),
    {
      name: 'surgeon-engine-store',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return { getItem: () => null, setItem: () => {}, removeItem: () => {} };
        }
        return {
          getItem: (name: string) => localStorage.getItem(name),
          setItem: (name: string, value: string) => {
            // Size guard
            if (value.length > 50 * 1024) {
              console.warn('SurgeonEngine: Skipping localStorage write (payload too large)');
              return;
            }
            try {
              localStorage.setItem(name, value);
            } catch {
              try { localStorage.removeItem(name); } catch {}
            }
          },
          removeItem: (name: string) => localStorage.removeItem(name),
        };
      }),
      // Only persist UI state and training signals
      partialize: (state) => ({
        bookId: state.bookId,
        domain: state.domain,
        selectedClusterId: state.selectedClusterId,
        selectedUnitId: state.selectedUnitId,
        activeMode: state.activeMode,
        trainingSignals: state.trainingSignals,
      }),
    }
  )
);

export default useSurgeonEngineStore;
