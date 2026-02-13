// lib/speechWhiteboard/whiteboardService.ts
// Whiteboard Service - Explain Overlay with reasoning prompts
// Architecture: Whiteboard attaches to cognitive units and generates structured explanations

import { create } from 'zustand';
import type {
  CognitiveUnitType,
  CognitiveUnitRef,
  WhiteboardExplanation,
  WhiteboardStep,
  WhiteboardGraphNode,
  WhiteboardGraphEdge,
  DecisionRuleCandidate,
  WhiteboardServiceState,
  NoteLabReasoningBlock,
} from './types';

// ============================================================================
// Whiteboard Service Store
// ============================================================================

interface WhiteboardServiceActions {
  // Explanation lifecycle
  generateExplanation: (
    unitRef: CognitiveUnitRef,
    sourceText: string,
    context?: { relationLabel?: string; clusterTitle?: string }
  ) => Promise<void>;
  showExplanation: (explanation: WhiteboardExplanation) => void;
  hideExplanation: () => void;
  clearCurrentExplanation: () => void;

  // User interaction
  submitResponse: (response: string) => Promise<void>;
  acceptDecisionRule: () => DecisionRuleCandidate | null;
  rejectDecisionRule: () => void;

  // Mode control
  setMode: (mode: 'view' | 'interact' | 'edit') => void;

  // NoteLab integration
  exportToNoteLab: () => NoteLabReasoningBlock | null;

  // History
  addToHistory: (explanation: WhiteboardExplanation) => void;
  getHistoryForUnit: (unitRef: CognitiveUnitRef) => WhiteboardExplanation[];
}

type WhiteboardServiceStore = WhiteboardServiceState & WhiteboardServiceActions;

// ============================================================================
// Prompt Generation
// ============================================================================

type PromptType = 'why' | 'when' | 'how' | 'what_if' | 'differential';

function selectPromptType(unitType: CognitiveUnitType, context?: { relationLabel?: string }): PromptType {
  // Select appropriate prompt based on unit type
  if (unitType === 'decisionRule') {
    return 'when';
  }
  if (unitType === 'relation') {
    const label = context?.relationLabel?.toLowerCase() || '';
    if (label.includes('causes') || label.includes('leads')) return 'why';
    if (label.includes('suggests') || label.includes('indicates')) return 'differential';
    return 'how';
  }
  if (unitType === 'cluster') {
    return 'what_if';
  }
  return 'why';
}

function generateReasoningPrompt(promptType: PromptType, context: string): string {
  switch (promptType) {
    case 'why':
      return `Why does this occur? Explain the underlying mechanism for: ${context}`;
    case 'when':
      return `When would you apply this? Describe the clinical scenario where: ${context}`;
    case 'how':
      return `How does this work step-by-step? Walk through the process of: ${context}`;
    case 'what_if':
      return `What if this changes? Consider what happens when: ${context}`;
    case 'differential':
      return `What else could it be? List alternatives to consider when: ${context}`;
    default:
      return `Explain your reasoning for: ${context}`;
  }
}

// ============================================================================
// Explanation Generation (Local mock - would call AI in production)
// ============================================================================

function generateMockExplanation(
  unitRef: CognitiveUnitRef,
  sourceText: string,
  context?: { relationLabel?: string; clusterTitle?: string }
): WhiteboardExplanation {
  const promptType = selectPromptType(unitRef.unitType, context);
  const contextLabel = context?.clusterTitle || context?.relationLabel || sourceText.slice(0, 50);

  // Generate 3-7 steps
  const steps: WhiteboardStep[] = [
    { id: 's1', order: 1, content: `Understanding the core concept from the source material.`, type: 'text' },
    { id: 's2', order: 2, content: `Key mechanism: ${sourceText.slice(0, 100)}...`, type: 'emphasis' },
    { id: 's3', order: 3, content: `This relates to clinical practice because it determines diagnosis or treatment.`, type: 'text' },
    { id: 's4', order: 4, content: `Warning: Misunderstanding this can lead to diagnostic errors.`, type: 'warning' },
    { id: 's5', order: 5, content: `The key takeaway is to always verify with confirmatory findings.`, type: 'key_point' },
  ];

  // Generate simple graph
  const nodes: WhiteboardGraphNode[] = [
    { id: 'n1', label: 'Finding', type: 'condition' },
    { id: 'n2', label: 'Mechanism', type: 'process' },
    { id: 'n3', label: 'Outcome', type: 'outcome' },
  ];

  const edges: WhiteboardGraphEdge[] = [
    { id: 'e1', from: 'n1', to: 'n2', label: 'triggers', type: 'causes' },
    { id: 'e2', from: 'n2', to: 'n3', label: 'results in', type: 'leads_to' },
  ];

  return {
    id: `wb_${Date.now()}`,
    unitType: unitRef.unitType,
    unitId: unitRef.unitId,
    steps,
    graphNodes: nodes,
    graphEdges: edges,
    prompt: generateReasoningPrompt(promptType, contextLabel),
    promptType,
    userResponse: null,
    feedback: null,
    feedbackGiven: false,
    decisionRuleCandidate: null,
    createdAt: Date.now(),
    sourceSpanHashes: unitRef.spanHash ? [unitRef.spanHash] : [],
  };
}

function generateMockFeedback(response: string): { feedback: string; ruleCandidate: DecisionRuleCandidate | null } {
  // In production, this would call AI for feedback
  const isGoodResponse = response.length > 20;

  const feedback = isGoodResponse
    ? `Good reasoning! You correctly identified the key mechanism. Consider also thinking about exceptions and edge cases.`
    : `Try to elaborate more. Think about the underlying mechanism and when this would apply clinically.`;

  const ruleCandidate: DecisionRuleCandidate | null = isGoodResponse
    ? {
        ifCondition: 'When this finding is present',
        thenAction: 'Consider this diagnosis and order confirmatory tests',
        confirmWith: ['Lab test A', 'Imaging study B'],
        tags: ['diagnosis', 'clinical-reasoning'],
        confidence: 0.75,
      }
    : null;

  return { feedback, ruleCandidate };
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useWhiteboardService = create<WhiteboardServiceStore>((set, get) => ({
  // Initial state
  currentExplanation: null,
  isGenerating: false,
  isVisible: false,
  mode: 'view',
  explanationHistory: [],

  // ========================================
  // Explanation Lifecycle
  // ========================================

  generateExplanation: async (unitRef, sourceText, context) => {
    set({ isGenerating: true, isVisible: true, mode: 'view' });

    try {
      // In production, call AI API here
      // For MVP, use mock generation
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate API delay

      const explanation = generateMockExplanation(unitRef, sourceText, context);

      set({
        currentExplanation: explanation,
        isGenerating: false,
        mode: 'interact',
      });

      // Add to history
      get().addToHistory(explanation);
    } catch (error) {
      console.error('Whiteboard generation error:', error);
      set({ isGenerating: false });
    }
  },

  showExplanation: (explanation) => {
    set({
      currentExplanation: explanation,
      isVisible: true,
      mode: 'view',
    });
  },

  hideExplanation: () => {
    set({ isVisible: false });
  },

  clearCurrentExplanation: () => {
    set({
      currentExplanation: null,
      isVisible: false,
      mode: 'view',
    });
  },

  // ========================================
  // User Interaction
  // ========================================

  submitResponse: async (response) => {
    const { currentExplanation } = get();
    if (!currentExplanation) return;

    set({ isGenerating: true });

    try {
      // In production, call AI for feedback
      await new Promise((resolve) => setTimeout(resolve, 300));

      const { feedback, ruleCandidate } = generateMockFeedback(response);

      const updated: WhiteboardExplanation = {
        ...currentExplanation,
        userResponse: response,
        feedback,
        feedbackGiven: true,
        decisionRuleCandidate: ruleCandidate,
      };

      set({
        currentExplanation: updated,
        isGenerating: false,
      });

      // Update in history
      set((state) => ({
        explanationHistory: state.explanationHistory.map((ex) =>
          ex.id === updated.id ? updated : ex
        ),
      }));
    } catch (error) {
      console.error('Feedback generation error:', error);
      set({ isGenerating: false });
    }
  },

  acceptDecisionRule: () => {
    const { currentExplanation } = get();
    if (!currentExplanation?.decisionRuleCandidate) return null;

    const rule = currentExplanation.decisionRuleCandidate;

    // Clear the candidate from current explanation
    set({
      currentExplanation: {
        ...currentExplanation,
        decisionRuleCandidate: null,
      },
    });

    return rule;
  },

  rejectDecisionRule: () => {
    const { currentExplanation } = get();
    if (!currentExplanation) return;

    set({
      currentExplanation: {
        ...currentExplanation,
        decisionRuleCandidate: null,
      },
    });
  },

  // ========================================
  // Mode Control
  // ========================================

  setMode: (mode) => {
    set({ mode });
  },

  // ========================================
  // NoteLab Integration
  // ========================================

  exportToNoteLab: () => {
    const { currentExplanation } = get();
    if (!currentExplanation) return null;

    const reasoningBlock: NoteLabReasoningBlock = {
      id: `nb_${Date.now()}`,
      sourceUnitRef: {
        unitType: currentExplanation.unitType,
        unitId: currentExplanation.unitId,
      },
      whiteboardExplanationId: currentExplanation.id,
      whyItMatters: '', // User fills in
      whenUsed: '', // User fills in
      myMistake: null,
      linkedRelationIds: [],
      linkedClusterIds:
        currentExplanation.unitType === 'cluster' ? [currentExplanation.unitId] : [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return reasoningBlock;
  },

  // ========================================
  // History
  // ========================================

  addToHistory: (explanation) => {
    set((state) => ({
      explanationHistory: [explanation, ...state.explanationHistory].slice(0, 50), // Keep last 50
    }));
  },

  getHistoryForUnit: (unitRef) => {
    return get().explanationHistory.filter(
      (ex) => ex.unitType === unitRef.unitType && ex.unitId === unitRef.unitId
    );
  },
}));

export default useWhiteboardService;
