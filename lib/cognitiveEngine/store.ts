// lib/cognitiveEngine/store.ts
// Cognitive Engine State Management
// Handles reasoning loops, insights, clinical IQ, and training sessions

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ClinicalInsight,
  DecisionRule,
  ReasoningLoop,
  ReasoningStep,
  ApplicationStep,
  FeedbackStep,
  ClinicalIQProfile,
  ExpertModeConfig,
  DATModeConfig,
  InsightPanelState,
  CognitiveTrainingSession,
  TrainingLevel,
  TrainingItem,
  MasteryLevel,
  WeakCluster,
} from './types';
import {
  createSafeStorage,
  putInsights,
  getInsights,
  putDecisionRules,
  getDecisionRules,
} from '../storage';

// ============================================================================
// Store State Interface
// ============================================================================

interface CognitiveEngineState {
  // Document context for IndexedDB storage
  currentDocId: string;

  // Insights (in-memory, persisted to IndexedDB)
  insights: Record<string, ClinicalInsight>;

  // Decision Rules (in-memory, persisted to IndexedDB)
  decisionRules: Record<string, DecisionRule>;

  // Active Reasoning Loops (in-memory only, not persisted)
  activeReasoningLoops: Record<string, ReasoningLoop>;
  completedReasoningLoops: string[];

  // Clinical IQ Profile (persisted to localStorage - limited fields)
  clinicalIQ: ClinicalIQProfile;

  // Mode Configs (persisted to localStorage)
  expertMode: ExpertModeConfig;
  datMode: DATModeConfig;

  // Insight Panel State (not persisted)
  insightPanel: InsightPanelState;

  // Training Sessions (not persisted - session data only)
  currentTrainingSession: CognitiveTrainingSession | null;
  trainingHistory: string[]; // Session IDs

  // Actions: Insights
  addInsight: (insight: ClinicalInsight) => void;
  updateInsightMastery: (insightId: string, level: MasteryLevel) => void;
  getInsightById: (id: string) => ClinicalInsight | null;
  getRelatedInsights: (insightId: string) => ClinicalInsight[];

  // Actions: Decision Rules
  addDecisionRule: (rule: DecisionRule) => void;
  updateDecisionRule: (ruleId: string, updates: Partial<DecisionRule>) => void;
  recordRuleApplication: (ruleId: string, success: boolean) => void;
  getActiveRules: () => DecisionRule[];

  // Actions: Reasoning Loop
  startReasoningLoop: (insightId: string) => ReasoningLoop;
  advanceReasoningLoop: (loopId: string) => void;
  submitApplication: (loopId: string, application: ApplicationStep) => void;
  provideFeedback: (loopId: string, feedback: FeedbackStep) => void;
  completeReasoningLoop: (loopId: string) => void;
  abandonReasoningLoop: (loopId: string) => void;
  getCurrentLoop: () => ReasoningLoop | null;

  // Actions: Clinical IQ
  updateClinicalIQ: (delta: Partial<ClinicalIQProfile>) => void;
  recordPatternRecognition: (correct: boolean) => void;
  recordReasoningQuality: (score: number) => void;
  addWeakCluster: (cluster: WeakCluster) => void;
  removeWeakCluster: (clusterId: string) => void;
  takeProgressSnapshot: () => void;

  // Actions: Expert Mode
  setExpertMode: (config: Partial<ExpertModeConfig>) => void;
  toggleExpertMode: () => void;

  // Actions: DAT Mode
  setDATMode: (config: Partial<DATModeConfig>) => void;
  toggleDATMode: () => void;
  addDATAlert: (alert: DATModeConfig['alerts'][0]) => void;

  // Actions: Insight Panel
  openInsightPanel: (insight: ClinicalInsight) => void;
  closeInsightPanel: () => void;
  setInsightPanelSection: (section: keyof Pick<InsightPanelState, 'showDecisionRule' | 'showRelatedConcepts' | 'showReasoningPrompt'>, show: boolean) => void;
  setPendingAction: (action: InsightPanelState['pendingAction']) => void;

  // Actions: Training Sessions
  startTrainingSession: (level: TrainingLevel, items: TrainingItem[]) => void;
  submitTrainingResponse: (itemId: string, response: string, confidence: 1 | 2 | 3 | 4 | 5) => void;
  advanceTraining: () => void;
  completeTrainingSession: () => void;
  getMistakeReplayItems: () => TrainingItem[];

  // Actions: Document Context & IndexedDB
  setDocumentId: (docId: string) => void;
  hydrateFromIndexedDB: () => Promise<void>;
  persistToIndexedDB: () => Promise<void>;
}

// ============================================================================
// Default States
// ============================================================================

const defaultClinicalIQ: ClinicalIQProfile = {
  userId: '',
  clinicalIQScore: 100, // Start at average
  patternRecognition: { score: 50, trend: 'stable', lastUpdated: Date.now(), sessionsCount: 0 },
  reasoningQuality: { score: 50, trend: 'stable', lastUpdated: Date.now(), sessionsCount: 0 },
  decisionRuleUsage: { score: 50, trend: 'stable', lastUpdated: Date.now(), sessionsCount: 0 },
  examApplicationSuccess: { score: 50, trend: 'stable', lastUpdated: Date.now(), sessionsCount: 0 },
  expertThinkingLevel: 'novice',
  totalPatternsRecognized: 0,
  totalDecisionRulesCreated: 0,
  weakClusters: [],
  progressHistory: [],
};

const defaultExpertMode: ExpertModeConfig = {
  enabled: false,
  showClusters: true,
  showPearls: true,
  showDecisionRules: true,
  showRiskSignals: true,
  hideParagraphs: true,
  hideLongExplanations: true,
  minPriority: 'medium',
};

const defaultDATMode: DATModeConfig = {
  enabled: false,
  prioritizeTestable: true,
  showCommonTraps: true,
  showPatternQuestions: true,
  showApplicationQuestions: true,
  alerts: [],
};

const defaultInsightPanel: InsightPanelState = {
  isOpen: false,
  selectedInsight: null,
  activeReasoningLoop: null,
  showDecisionRule: true,
  showRelatedConcepts: true,
  showReasoningPrompt: false,
  pendingAction: null,
};

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateMasteryLevel(score: number): MasteryLevel {
  if (score >= 90) return 'expert';
  if (score >= 75) return 'proficient';
  if (score >= 60) return 'competent';
  if (score >= 40) return 'developing';
  return 'novice';
}

function calculateClinicalIQ(profile: ClinicalIQProfile): number {
  const weights = {
    patternRecognition: 0.3,
    reasoningQuality: 0.35,
    decisionRuleUsage: 0.2,
    examApplicationSuccess: 0.15,
  };

  const weightedSum =
    profile.patternRecognition.score * weights.patternRecognition +
    profile.reasoningQuality.score * weights.reasoningQuality +
    profile.decisionRuleUsage.score * weights.decisionRuleUsage +
    profile.examApplicationSuccess.score * weights.examApplicationSuccess;

  // Scale to IQ-like range (70-200)
  return Math.round(70 + (weightedSum / 100) * 130);
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useCognitiveEngineStore = create<CognitiveEngineState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentDocId: '',
      insights: {},
      decisionRules: {},
      activeReasoningLoops: {},
      completedReasoningLoops: [],
      clinicalIQ: defaultClinicalIQ,
      expertMode: defaultExpertMode,
      datMode: defaultDATMode,
      insightPanel: defaultInsightPanel,
      currentTrainingSession: null,
      trainingHistory: [],

      // ========================================
      // Insights Actions
      // ========================================

      addInsight: (insight: ClinicalInsight) => {
        set((state) => ({
          insights: { ...state.insights, [insight.id]: insight },
        }));
      },

      updateInsightMastery: (insightId: string, level: MasteryLevel) => {
        set((state) => ({
          insights: {
            ...state.insights,
            [insightId]: state.insights[insightId]
              ? { ...state.insights[insightId], masteryLevel: level }
              : state.insights[insightId],
          },
        }));
      },

      getInsightById: (id: string) => {
        return get().insights[id] || null;
      },

      getRelatedInsights: (insightId: string) => {
        const insight = get().insights[insightId];
        if (!insight) return [];

        return insight.relatedConcepts
          .map((id) => get().insights[id])
          .filter(Boolean) as ClinicalInsight[];
      },

      // ========================================
      // Decision Rules Actions
      // ========================================

      addDecisionRule: (rule: DecisionRule) => {
        set((state) => ({
          decisionRules: { ...state.decisionRules, [rule.id]: rule },
          clinicalIQ: {
            ...state.clinicalIQ,
            totalDecisionRulesCreated: state.clinicalIQ.totalDecisionRulesCreated + 1,
          },
        }));
      },

      updateDecisionRule: (ruleId: string, updates: Partial<DecisionRule>) => {
        set((state) => ({
          decisionRules: {
            ...state.decisionRules,
            [ruleId]: state.decisionRules[ruleId]
              ? { ...state.decisionRules[ruleId], ...updates }
              : state.decisionRules[ruleId],
          },
        }));
      },

      recordRuleApplication: (ruleId: string, success: boolean) => {
        const rule = get().decisionRules[ruleId];
        if (!rule) return;

        const newTimesApplied = rule.timesApplied + 1;
        const newSuccessRate =
          (rule.successRate * rule.timesApplied + (success ? 100 : 0)) / newTimesApplied;

        get().updateDecisionRule(ruleId, {
          timesApplied: newTimesApplied,
          successRate: newSuccessRate,
        });

        // Update clinical IQ
        get().recordReasoningQuality(success ? 80 : 40);
      },

      getActiveRules: () => {
        return Object.values(get().decisionRules).filter((rule) => rule.isActive);
      },

      // ========================================
      // Reasoning Loop Actions
      // ========================================

      startReasoningLoop: (insightId: string) => {
        const insight = get().insights[insightId];
        if (!insight) throw new Error('Insight not found');

        const loop: ReasoningLoop = {
          id: generateId(),
          insightId,
          currentStep: 'perception',
          perception: {
            pattern: insight.concept,
            sourceText: '', // Will be populated
            confidence: 0.8,
          },
          interpretation: {
            insight,
            significance: insight.whyItMatters,
          },
          reasoningPrompt: {
            prompt: `When would "${insight.concept}" matter clinically?`,
            promptType: 'clinical_application',
            hints: [],
          },
          application: null,
          feedback: null,
          storage: null,
          status: 'in_progress',
          startedAt: Date.now(),
        };

        set((state) => ({
          activeReasoningLoops: { ...state.activeReasoningLoops, [loop.id]: loop },
          insightPanel: {
            ...state.insightPanel,
            activeReasoningLoop: loop,
          },
        }));

        return loop;
      },

      advanceReasoningLoop: (loopId: string) => {
        const loop = get().activeReasoningLoops[loopId];
        if (!loop) return;

        const stepOrder: ReasoningStep[] = [
          'perception',
          'interpretation',
          'reasoning_prompt',
          'application',
          'feedback',
          'storage',
        ];

        const currentIndex = stepOrder.indexOf(loop.currentStep);
        if (currentIndex < stepOrder.length - 1) {
          const nextStep = stepOrder[currentIndex + 1];
          set((state) => ({
            activeReasoningLoops: {
              ...state.activeReasoningLoops,
              [loopId]: { ...loop, currentStep: nextStep },
            },
          }));
        }
      },

      submitApplication: (loopId: string, application: ApplicationStep) => {
        const loop = get().activeReasoningLoops[loopId];
        if (!loop) return;

        set((state) => ({
          activeReasoningLoops: {
            ...state.activeReasoningLoops,
            [loopId]: { ...loop, application, currentStep: 'feedback' },
          },
        }));
      },

      provideFeedback: (loopId: string, feedback: FeedbackStep) => {
        const loop = get().activeReasoningLoops[loopId];
        if (!loop) return;

        set((state) => ({
          activeReasoningLoops: {
            ...state.activeReasoningLoops,
            [loopId]: { ...loop, feedback, currentStep: 'storage' },
          },
        }));

        // Update clinical IQ based on feedback
        get().recordReasoningQuality(feedback.evaluation.qualityScore);
      },

      completeReasoningLoop: (loopId: string) => {
        const loop = get().activeReasoningLoops[loopId];
        if (!loop) return;

        const completedLoop = {
          ...loop,
          status: 'completed' as const,
          completedAt: Date.now(),
          storage: {
            storedAs: 'insight' as const,
            referenceId: loop.insightId,
            studyModeLinked: true,
          },
        };

        set((state) => {
          const { [loopId]: _, ...remainingLoops } = state.activeReasoningLoops;
          return {
            activeReasoningLoops: remainingLoops,
            completedReasoningLoops: [...state.completedReasoningLoops, loopId],
            insightPanel: {
              ...state.insightPanel,
              activeReasoningLoop: null,
            },
          };
        });

        // Update pattern recognition stats
        get().recordPatternRecognition(true);
      },

      abandonReasoningLoop: (loopId: string) => {
        set((state) => {
          const { [loopId]: _, ...remainingLoops } = state.activeReasoningLoops;
          return {
            activeReasoningLoops: remainingLoops,
            insightPanel: {
              ...state.insightPanel,
              activeReasoningLoop: null,
            },
          };
        });
      },

      getCurrentLoop: () => {
        const loops = Object.values(get().activeReasoningLoops);
        return loops.find((l) => l.status === 'in_progress') || null;
      },

      // ========================================
      // Clinical IQ Actions
      // ========================================

      updateClinicalIQ: (delta: Partial<ClinicalIQProfile>) => {
        set((state) => {
          const updated = { ...state.clinicalIQ, ...delta };
          updated.clinicalIQScore = calculateClinicalIQ(updated);
          updated.expertThinkingLevel = calculateMasteryLevel(
            (updated.patternRecognition.score + updated.reasoningQuality.score) / 2
          );
          return { clinicalIQ: updated };
        });
      },

      recordPatternRecognition: (correct: boolean) => {
        set((state) => {
          const current = state.clinicalIQ.patternRecognition;
          const delta = correct ? 2 : -1;
          const newScore = Math.max(0, Math.min(100, current.score + delta));
          const trend =
            newScore > current.score
              ? 'improving'
              : newScore < current.score
              ? 'declining'
              : 'stable';

          const updated: ClinicalIQProfile = {
            ...state.clinicalIQ,
            patternRecognition: {
              score: newScore,
              trend,
              lastUpdated: Date.now(),
              sessionsCount: current.sessionsCount + 1,
            },
            totalPatternsRecognized: state.clinicalIQ.totalPatternsRecognized + (correct ? 1 : 0),
          };

          updated.clinicalIQScore = calculateClinicalIQ(updated);
          return { clinicalIQ: updated };
        });
      },

      recordReasoningQuality: (score: number) => {
        set((state) => {
          const current = state.clinicalIQ.reasoningQuality;
          // Weighted average with more weight on recent
          const newScore = Math.round(current.score * 0.7 + score * 0.3);
          const trend =
            newScore > current.score
              ? 'improving'
              : newScore < current.score
              ? 'declining'
              : 'stable';

          const updated: ClinicalIQProfile = {
            ...state.clinicalIQ,
            reasoningQuality: {
              score: newScore,
              trend,
              lastUpdated: Date.now(),
              sessionsCount: current.sessionsCount + 1,
            },
          };

          updated.clinicalIQScore = calculateClinicalIQ(updated);
          updated.expertThinkingLevel = calculateMasteryLevel(
            (updated.patternRecognition.score + updated.reasoningQuality.score) / 2
          );
          return { clinicalIQ: updated };
        });
      },

      addWeakCluster: (cluster: WeakCluster) => {
        set((state) => ({
          clinicalIQ: {
            ...state.clinicalIQ,
            weakClusters: [...state.clinicalIQ.weakClusters, cluster],
          },
        }));
      },

      removeWeakCluster: (clusterId: string) => {
        set((state) => ({
          clinicalIQ: {
            ...state.clinicalIQ,
            weakClusters: state.clinicalIQ.weakClusters.filter((c) => c.clusterId !== clusterId),
          },
        }));
      },

      takeProgressSnapshot: () => {
        set((state) => ({
          clinicalIQ: {
            ...state.clinicalIQ,
            progressHistory: [
              ...state.clinicalIQ.progressHistory,
              {
                timestamp: Date.now(),
                clinicalIQScore: state.clinicalIQ.clinicalIQScore,
                patternsRecognized: state.clinicalIQ.totalPatternsRecognized,
                reasoningLoopsCompleted: state.completedReasoningLoops.length,
              },
            ],
          },
        }));
      },

      // ========================================
      // Expert Mode Actions
      // ========================================

      setExpertMode: (config: Partial<ExpertModeConfig>) => {
        set((state) => ({
          expertMode: { ...state.expertMode, ...config },
        }));
      },

      toggleExpertMode: () => {
        set((state) => ({
          expertMode: { ...state.expertMode, enabled: !state.expertMode.enabled },
        }));
      },

      // ========================================
      // DAT Mode Actions
      // ========================================

      setDATMode: (config: Partial<DATModeConfig>) => {
        set((state) => ({
          datMode: { ...state.datMode, ...config },
        }));
      },

      toggleDATMode: () => {
        set((state) => ({
          datMode: { ...state.datMode, enabled: !state.datMode.enabled },
        }));
      },

      addDATAlert: (alert: DATModeConfig['alerts'][0]) => {
        set((state) => ({
          datMode: {
            ...state.datMode,
            alerts: [...state.datMode.alerts, alert],
          },
        }));
      },

      // ========================================
      // Insight Panel Actions
      // ========================================

      openInsightPanel: (insight: ClinicalInsight) => {
        set({
          insightPanel: {
            ...defaultInsightPanel,
            isOpen: true,
            selectedInsight: insight,
          },
        });
      },

      closeInsightPanel: () => {
        set((state) => ({
          insightPanel: {
            ...state.insightPanel,
            isOpen: false,
            selectedInsight: null,
          },
        }));
      },

      setInsightPanelSection: (section, show) => {
        set((state) => ({
          insightPanel: { ...state.insightPanel, [section]: show },
        }));
      },

      setPendingAction: (action) => {
        set((state) => ({
          insightPanel: { ...state.insightPanel, pendingAction: action },
        }));
      },

      // ========================================
      // Training Session Actions
      // ========================================

      startTrainingSession: (level: TrainingLevel, items: TrainingItem[]) => {
        const session: CognitiveTrainingSession = {
          id: generateId(),
          trainingLevel: level,
          items,
          currentIndex: 0,
          correctCount: 0,
          incorrectCount: 0,
          startedAt: Date.now(),
          mistakeReplayItems: [],
        };

        set({ currentTrainingSession: session });
      },

      submitTrainingResponse: (itemId: string, response: string, confidence: 1 | 2 | 3 | 4 | 5) => {
        set((state) => {
          if (!state.currentTrainingSession) return state;

          const updatedItems = state.currentTrainingSession.items.map((item) => {
            if (item.id !== itemId) return item;

            // Evaluate correctness (simplified - would use AI in production)
            const isCorrect =
              item.correctChoiceIndex !== undefined
                ? response === String(item.correctChoiceIndex)
                : response.toLowerCase().includes(item.expectedAnswer?.toLowerCase() || '');

            return {
              ...item,
              userResponse: response,
              userConfidence: confidence,
              isCorrect,
              answeredAt: Date.now(),
            };
          });

          const answeredItem = updatedItems.find((i) => i.id === itemId);
          const isCorrect = answeredItem?.isCorrect || false;

          return {
            currentTrainingSession: {
              ...state.currentTrainingSession,
              items: updatedItems,
              correctCount: state.currentTrainingSession.correctCount + (isCorrect ? 1 : 0),
              incorrectCount: state.currentTrainingSession.incorrectCount + (isCorrect ? 0 : 1),
              mistakeReplayItems: isCorrect
                ? state.currentTrainingSession.mistakeReplayItems
                : [...state.currentTrainingSession.mistakeReplayItems, itemId],
            },
          };
        });
      },

      advanceTraining: () => {
        set((state) => {
          if (!state.currentTrainingSession) return state;
          return {
            currentTrainingSession: {
              ...state.currentTrainingSession,
              currentIndex: state.currentTrainingSession.currentIndex + 1,
            },
          };
        });
      },

      completeTrainingSession: () => {
        set((state) => {
          if (!state.currentTrainingSession) return state;

          const session = state.currentTrainingSession;
          const accuracy =
            session.correctCount / (session.correctCount + session.incorrectCount) || 0;

          // Update exam application success
          const current = state.clinicalIQ.examApplicationSuccess;
          const newScore = Math.round(current.score * 0.7 + accuracy * 100 * 0.3);

          return {
            currentTrainingSession: {
              ...session,
              completedAt: Date.now(),
            },
            trainingHistory: [...state.trainingHistory, session.id],
            clinicalIQ: {
              ...state.clinicalIQ,
              examApplicationSuccess: {
                score: newScore,
                trend: newScore > current.score ? 'improving' : 'stable',
                lastUpdated: Date.now(),
                sessionsCount: current.sessionsCount + 1,
              },
            },
          };
        });
      },

      getMistakeReplayItems: () => {
        const session = get().currentTrainingSession;
        if (!session) return [];

        return session.items.filter((item) =>
          session.mistakeReplayItems.includes(item.id)
        );
      },

      // ========================================
      // Document Context & IndexedDB Actions
      // ========================================

      setDocumentId: (docId: string) => {
        const current = get().currentDocId;
        if (current !== docId) {
          // Persist current data before switching
          if (current) {
            get().persistToIndexedDB().catch(console.warn);
          }
          // Clear in-memory data and set new doc
          set({
            currentDocId: docId,
            insights: {},
            decisionRules: {},
            activeReasoningLoops: {},
          });
          // Hydrate from IndexedDB for new doc
          if (docId) {
            get().hydrateFromIndexedDB().catch(console.warn);
          }
        }
      },

      hydrateFromIndexedDB: async () => {
        const docId = get().currentDocId;
        if (!docId) return;

        try {
          const [insights, rules] = await Promise.all([
            getInsights<ClinicalInsight>(docId),
            getDecisionRules<DecisionRule>(docId),
          ]);

          if (insights || rules) {
            set({
              insights: insights || {},
              decisionRules: rules || {},
            });
            console.log('[CognitiveEngine] Hydrated from IndexedDB for', docId);
          }
        } catch (error) {
          console.warn('[CognitiveEngine] IndexedDB hydration failed:', error);
        }
      },

      persistToIndexedDB: async () => {
        const { currentDocId, insights, decisionRules } = get();
        if (!currentDocId) return;

        try {
          await Promise.all([
            Object.keys(insights).length > 0 && putInsights(currentDocId, insights),
            Object.keys(decisionRules).length > 0 && putDecisionRules(currentDocId, decisionRules),
          ]);
          console.log('[CognitiveEngine] Persisted to IndexedDB for', currentDocId);
        } catch (error) {
          console.warn('[CognitiveEngine] IndexedDB persist failed:', error);
        }
      },
    }),
    {
      name: 'cognitive-engine-store',
      storage: createJSONStorage(() => createSafeStorage({
        maxSize: 100 * 1024, // 100KB limit
        onQuotaExceeded: (error, key) => {
          console.warn(`[CognitiveEngine] Storage quota exceeded for ${key}:`, error.message);
        },
        onStateTooLarge: (size, key) => {
          console.warn(`[CognitiveEngine] State too large for ${key}: ${Math.round(size / 1024)}KB`);
        },
      })),
      // Only persist minimal UI state and scores - NOT large data collections
      partialize: (state) => ({
        currentDocId: state.currentDocId,
        // Clinical IQ - but limit progressHistory to last 50 entries
        clinicalIQ: {
          ...state.clinicalIQ,
          progressHistory: state.clinicalIQ.progressHistory.slice(-50),
          weakClusters: state.clinicalIQ.weakClusters.slice(-20),
        },
        // Mode configs (small)
        expertMode: state.expertMode,
        datMode: {
          ...state.datMode,
          alerts: state.datMode.alerts.slice(-10), // Limit alerts
        },
        // Only persist counts, not full loops
        completedReasoningLoopsCount: state.completedReasoningLoops.length,
        // Only persist IDs, not full session data
        trainingHistoryCount: state.trainingHistory.length,
      }),
      skipHydration: typeof window === 'undefined',
    }
  )
);

export default useCognitiveEngineStore;
