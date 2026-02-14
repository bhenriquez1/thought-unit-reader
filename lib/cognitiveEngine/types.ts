// lib/cognitiveEngine/types.ts
// Cognitive Architecture Types for Surgeon-View
// This is NOT notes - this is pattern detection, decision logic, clinical insight extraction

// ============================================================================
// Core Cognitive Elements
// ============================================================================

/**
 * A clinical insight extracted from content
 * This is perception output, not user notes
 */
export interface ClinicalInsight {
  id: string;
  conceptId: string;

  // The exact pattern/concept detected
  concept: string;

  // Why this matters clinically/academically
  whyItMatters: string;

  // High-value insight (pearl)
  clinicalPearl?: string;

  // IF → THEN → CONFIRM rule
  decisionRule?: DecisionRule;

  // Risk or warning signal
  riskSignal?: string;

  // Related concept IDs
  relatedConcepts: string[];

  // Source anchor
  sourceAnchor: {
    pageIndex: number;
    paragraphIndex: number;
    snippetHash: string;
  };

  // Metadata
  createdAt: number;
  masteryLevel: MasteryLevel;
}

/**
 * Decision Rule: IF → THEN → CONFIRM structure
 */
export interface DecisionRule {
  id: string;

  // The condition
  ifCondition: string;

  // The action/conclusion
  thenAction: string;

  // Confirmation/validation step
  confirmWith?: string;

  // Associated concept
  conceptId: string;

  // Usage tracking
  timesApplied: number;
  successRate: number;

  // For Study Mode
  isActive: boolean;
}

/**
 * Mastery levels for cognitive progression
 */
export type MasteryLevel = 'novice' | 'developing' | 'competent' | 'proficient' | 'expert';

// ============================================================================
// Clinical Reasoning Loop (6-Step Flow)
// ============================================================================

/**
 * The 6-step clinical reasoning loop
 * 1. Perception → 2. Interpretation → 3. Reasoning Prompt →
 * 4. Application → 5. Feedback → 6. Storage
 */
export interface ReasoningLoop {
  id: string;
  insightId: string;

  // Current step in the loop
  currentStep: ReasoningStep;

  // Step data
  perception: PerceptionStep;
  interpretation: InterpretationStep;
  reasoningPrompt: ReasoningPromptStep;
  application: ApplicationStep | null;
  feedback: FeedbackStep | null;
  storage: StorageStep | null;

  // Status
  status: 'in_progress' | 'completed' | 'abandoned';
  startedAt: number;
  completedAt?: number;
}

export type ReasoningStep =
  | 'perception'
  | 'interpretation'
  | 'reasoning_prompt'
  | 'application'
  | 'feedback'
  | 'storage';

export interface PerceptionStep {
  // What pattern was detected
  pattern: string;
  // Source text
  sourceText: string;
  // Confidence of detection
  confidence: number;
}

export interface InterpretationStep {
  // System-generated insight
  insight: ClinicalInsight;
  // Why this pattern matters
  significance: string;
}

export interface ReasoningPromptStep {
  // The question posed to user
  prompt: string;
  // Type of reasoning required
  promptType: 'clinical_application' | 'when_matters' | 'decision_making' | 'risk_assessment';
  // Hints available
  hints: string[];
}

export interface ApplicationStep {
  // User's answer
  userAnswer: string;
  // Time taken to answer
  responseTimeMs: number;
  // Confidence rating (user self-report)
  confidenceRating: 1 | 2 | 3 | 4 | 5;
}

export interface FeedbackStep {
  // AI evaluation
  evaluation: ReasoningEvaluation;
  // Improvement suggestion
  improvementSuggestion: string;
  // Refined reasoning
  refinedReasoning: string;
  // Next-level thinking prompt
  nextLevelThinking?: string;
}

export interface StorageStep {
  // What was stored
  storedAs: 'decision_rule' | 'insight' | 'connection';
  // Reference ID
  referenceId: string;
  // Linked to Study Mode
  studyModeLinked: boolean;
}

// ============================================================================
// AI Reasoning Feedback Engine
// ============================================================================

export interface ReasoningEvaluation {
  // Overall quality score 0-100
  qualityScore: number;

  // Individual metrics
  accuracy: EvaluationMetric;
  depth: EvaluationMetric;
  clinicalLogic: EvaluationMetric;

  // Missing factors the user didn't consider
  missingFactors: string[];

  // Cognitive traps detected
  cognitiveTrap?: CognitiveTrap;
}

export interface EvaluationMetric {
  score: number; // 0-100
  feedback: string;
}

export interface CognitiveTrap {
  type: 'anchoring' | 'confirmation_bias' | 'availability_heuristic' | 'premature_closure' | 'other';
  description: string;
  correction: string;
}

// ============================================================================
// Clinical IQ Progress System
// ============================================================================

export interface ClinicalIQProfile {
  userId: string;

  // Overall score
  clinicalIQScore: number; // 0-200 scale (like IQ)

  // Sub-scores
  patternRecognition: SkillMetric;
  reasoningQuality: SkillMetric;
  decisionRuleUsage: SkillMetric;
  examApplicationSuccess: SkillMetric;

  // Progress tracking
  expertThinkingLevel: MasteryLevel;
  totalPatternsRecognized: number;
  totalDecisionRulesCreated: number;

  // Weak areas
  weakClusters: WeakCluster[];

  // History
  progressHistory: ProgressSnapshot[];
}

export interface SkillMetric {
  score: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: number;
  sessionsCount: number;
}

export interface WeakCluster {
  clusterId: string;
  clusterName: string;
  weakness: 'recognition' | 'application' | 'reasoning';
  recommendedAction: string;
}

export interface ProgressSnapshot {
  timestamp: number;
  clinicalIQScore: number;
  patternsRecognized: number;
  reasoningLoopsCompleted: number;
}

// ============================================================================
// Expert Mode Types
// ============================================================================

export interface ExpertModeConfig {
  enabled: boolean;

  // What to show
  showClusters: boolean;
  showPearls: boolean;
  showDecisionRules: boolean;
  showRiskSignals: boolean;

  // What to hide
  hideParagraphs: boolean;
  hideLongExplanations: boolean;

  // Minimum priority to display
  minPriority: 'high' | 'medium' | 'low';
}

// ============================================================================
// DAT Mode Types
// ============================================================================

export interface DATModeConfig {
  enabled: boolean;

  // Content prioritization
  prioritizeTestable: boolean;
  showCommonTraps: boolean;
  showPatternQuestions: boolean;
  showApplicationQuestions: boolean;

  // Alert types
  alerts: DATAlert[];
}

export interface DATAlert {
  type: 'trap' | 'misconception' | 'high_yield';
  conceptId: string;
  message: string;
  examRelevance: 'very_high' | 'high' | 'moderate';
}

// ============================================================================
// NoteLab 2.0 Types (Cognitive Workspace)
// ============================================================================

export interface CognitiveNote {
  id: string;

  // Core content
  content: string;

  // Linked concepts from Surgeon-View
  linkedConcepts: LinkedConcept[];

  // Structured reasoning blocks
  reasoningBlocks: ReasoningBlock[];

  // Decision rules created
  decisionRules: DecisionRule[];

  // Detected insights
  detectedInsights: DetectedInsight[];

  // Metadata
  createdAt: number;
  updatedAt: number;
  pageContext?: number;
}

export interface LinkedConcept {
  conceptId: string;
  conceptLabel: string;
  linkType: 'supports' | 'contradicts' | 'extends' | 'example_of';
  backlinks: string[]; // IDs of notes that link to this concept
}

export interface ReasoningBlock {
  id: string;
  type: 'why_it_matters' | 'when_used' | 'my_example' | 'my_mistake';
  content: string;
  linkedConceptId?: string;
}

export interface DetectedInsight {
  type: 'misconception' | 'repeated_error' | 'breakthrough' | 'connection';
  description: string;
  severity: 'info' | 'warning' | 'critical';
  suggestion?: string;
}

// ============================================================================
// Study Mode Engine Types (Cognitive Training)
// ============================================================================

export interface CognitiveTrainingSession {
  id: string;

  // Training type
  trainingLevel: TrainingLevel;

  // Content
  items: TrainingItem[];

  // Progress
  currentIndex: number;
  correctCount: number;
  incorrectCount: number;

  // Analytics
  startedAt: number;
  completedAt?: number;
  mistakeReplayItems: string[]; // IDs of items to replay
}

export type TrainingLevel = 'recall' | 'recognition' | 'application' | 'decision_reasoning';

export interface TrainingItem {
  id: string;
  conceptId: string;

  // Question/prompt
  prompt: string;
  promptType: TrainingLevel;

  // For multiple choice
  choices?: string[];
  correctChoiceIndex?: number;

  // For free response
  expectedAnswer?: string;

  // User response
  userResponse?: string;
  userConfidence?: 1 | 2 | 3 | 4 | 5;

  // Evaluation
  isCorrect?: boolean;
  errorAnalysis?: ErrorAnalysis;

  // Timing
  presentedAt?: number;
  answeredAt?: number;
}

export interface ErrorAnalysis {
  // What pattern was missed
  missedPattern?: string;

  // Cognitive trap identified
  cognitiveTrap?: CognitiveTrap;

  // Correct reasoning path
  correctReasoningPath: string;

  // Recommended review
  reviewRecommendation: string;
}

// ============================================================================
// Insight Panel State
// ============================================================================

export interface InsightPanelState {
  isOpen: boolean;
  selectedInsight: ClinicalInsight | null;
  activeReasoningLoop: ReasoningLoop | null;

  // Panel sections
  showDecisionRule: boolean;
  showRelatedConcepts: boolean;
  showReasoningPrompt: boolean;

  // Actions pending
  pendingAction: 'send_to_notelab' | 'train_in_study' | null;
}

// ============================================================================
// NoteLab 2.0 - Enhanced Types for 3-Lane Kanban
// ============================================================================

/**
 * Note types for categorization
 */
export type NoteLabNoteType =
  | 'INSIGHT'       // Auto-imported from Priority Feed + highlights
  | 'DIFFERENTIAL'  // Compare/contrast patterns
  | 'DECISION_RULE' // IF → THEN → CONFIRM
  | 'PATHWAY'       // Process/causal chains
  | 'TRAP'          // Common mistakes, exam traps
  | 'MNEMONIC'      // Memory aids
  | 'QUESTION';     // Questions to investigate

/**
 * Lane types for 3-lane Kanban
 */
export type NoteLabLane =
  | 'insights'   // Auto-imported insights + highlights
  | 'reasoning'  // Differentials, decision rules, pathways
  | 'memory';    // Flashcards, mnemonics, traps

/**
 * Miss Detector - Why I might miss this + how to catch it
 */
export interface MissDetector {
  whyIMightMiss: string;       // Common reasons for missing
  howToDetectNextTime: string; // Detection strategy
  closestLookAlike: string;    // Most commonly confused with
}

/**
 * NoteLab 2.0 Note structure
 */
export interface NoteLabNote {
  id: string;

  // Core content
  title: string;
  content: string;
  noteType: NoteLabNoteType;
  lane: NoteLabLane;

  // Miss Detector (optional but encouraged)
  missDetector?: MissDetector;

  // Source tracking
  sourceType?: 'insight' | 'relation' | 'cluster' | 'rule' | 'manual';
  sourceId?: string;

  // Page context
  pageIndex?: number;
  quote?: string;

  // Tags for filtering
  tags: string[];

  // Importance bucket from source (if from insight)
  importanceBucket?: 'CRITICAL' | 'HIGH_YIELD' | 'IMPORTANT' | 'CONTEXT';

  // User state
  isConfusing: boolean;
  isMastered: boolean;
  reviewCount: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
  lastReviewedAt?: number;
}

/**
 * Quick capture button types
 */
export type QuickCaptureType =
  | 'insight'    // 💡 → insights lane
  | 'confusing'  // ⚠️ → reasoning lane
  | 'review'     // 🔁 → memory lane
  | 'high_yield' // 🔥 → insights lane
  | 'question';  // ❓ → reasoning lane

/**
 * NoteLab store state
 */
export interface NoteLabStoreState {
  // Notes by ID
  notes: Record<string, NoteLabNote>;

  // Quick access indexes
  notesByLane: Record<NoteLabLane, string[]>;
  notesByType: Record<NoteLabNoteType, string[]>;
  notesByPage: Record<number, string[]>;

  // UI state
  selectedNoteId?: string;
  activeLane: NoteLabLane;
  filterByType?: NoteLabNoteType;
  showMasteredNotes: boolean;

  // Search
  searchQuery: string;
}

/**
 * NoteLab store actions
 */
export interface NoteLabStoreActions {
  // CRUD
  addNote: (note: Omit<NoteLabNote, 'id' | 'createdAt' | 'updatedAt' | 'reviewCount'>) => string;
  updateNote: (noteId: string, updates: Partial<NoteLabNote>) => void;
  deleteNote: (noteId: string) => void;

  // Quick capture
  quickCapture: (
    type: QuickCaptureType,
    content: string,
    sourceId?: string,
    pageIndex?: number
  ) => string;

  // Import from insights
  importFromInsight: (insight: {
    id: string;
    title: string;
    claim: string;
    whyItMatters: string;
    bucket: string;
    sourceId: string;
    sourceType: string;
    evidence: { page: number; text: string }[];
    tags: string[];
  }) => string;

  // Miss Detector
  updateMissDetector: (noteId: string, missDetector: MissDetector) => void;

  // State changes
  markConfusing: (noteId: string) => void;
  markMastered: (noteId: string) => void;
  moveToLane: (noteId: string, lane: NoteLabLane) => void;

  // Review
  recordReview: (noteId: string) => void;

  // UI
  selectNote: (noteId: string | undefined) => void;
  setActiveLane: (lane: NoteLabLane) => void;
  setFilterByType: (type: NoteLabNoteType | undefined) => void;
  toggleShowMastered: () => void;
  setSearchQuery: (query: string) => void;

  // Getters
  getNotesForLane: (lane: NoteLabLane) => NoteLabNote[];
  getConfusingNotes: () => NoteLabNote[];
  getNotesForReview: () => NoteLabNote[];
}
