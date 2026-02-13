// lib/speechWhiteboard/types.ts
// Speech + Whiteboard Integration Types
// Architecture: Everything attaches to cognitive units (span, relation, cluster, decisionRule)

// ============================================================================
// Unit Types - The foundation everything attaches to
// ============================================================================

export type CognitiveUnitType = 'span' | 'relation' | 'cluster' | 'decisionRule';

export interface CognitiveUnitRef {
  unitType: CognitiveUnitType;
  unitId: string;
  // Optional context
  docId?: string;
  page?: number;
  spanHash?: string;
}

// ============================================================================
// Speech Types
// ============================================================================

export type SpeechPauseReason =
  | 'heading'
  | 'figure'
  | 'table'
  | 'formula'
  | 'definition'
  | 'user_paused'
  | 'end_of_content';

export interface SpeechSession {
  id: string;
  unitType: CognitiveUnitType;
  unitId: string;
  spanHashes: string[];          // Ordered spans to read
  currentSpanIndex: number;
  currentSpanHash: string | null;
  status: 'idle' | 'playing' | 'paused' | 'completed';
  pausedReason: SpeechPauseReason | null;
  pausedAtSpanHash: string | null;
  // TTS settings
  rate: number;                  // 0.5 - 2.0
  voice: string | null;
  // Progress
  startedAt: number | null;
  totalDuration: number | null;
  elapsedTime: number;
}

export interface SpeechSessionActions {
  play: () => void;
  pause: () => void;
  stop: () => void;
  skipToSpan: (spanHash: string) => void;
  setRate: (rate: number) => void;
  setVoice: (voice: string) => void;
}

// Auto-pause detection
export interface AutoPauseConfig {
  pauseOnHeadings: boolean;
  pauseOnFigures: boolean;
  pauseOnTables: boolean;
  pauseOnFormulas: boolean;
  pauseOnDefinitions: boolean;
}

// ============================================================================
// Whiteboard Types
// ============================================================================

export interface WhiteboardStep {
  id: string;
  order: number;
  content: string;
  type: 'text' | 'emphasis' | 'warning' | 'key_point';
}

export interface WhiteboardGraphNode {
  id: string;
  label: string;
  type: 'concept' | 'process' | 'outcome' | 'condition';
  x?: number;
  y?: number;
}

export interface WhiteboardGraphEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  type: 'causes' | 'prevents' | 'leads_to' | 'requires' | 'suggests';
}

export interface WhiteboardExplanation {
  id: string;
  unitType: CognitiveUnitType;
  unitId: string;
  // Content (3-7 steps)
  steps: WhiteboardStep[];
  // Visual (node/arrow sketch)
  graphNodes: WhiteboardGraphNode[];
  graphEdges: WhiteboardGraphEdge[];
  // Reasoning prompt at the end
  prompt: string;
  promptType: 'why' | 'when' | 'how' | 'what_if' | 'differential';
  // User interaction
  userResponse: string | null;
  feedback: string | null;
  feedbackGiven: boolean;
  // Decision rule candidate
  decisionRuleCandidate: DecisionRuleCandidate | null;
  // Metadata
  createdAt: number;
  sourceSpanHashes: string[];
}

export interface DecisionRuleCandidate {
  ifCondition: string;
  thenAction: string;
  confirmWith: string[];
  tags: string[];
  confidence: number;
}

// ============================================================================
// Pause Action Types (what user can do at pause)
// ============================================================================

export type PauseAction =
  | { type: 'explain'; unitRef: CognitiveUnitRef }
  | { type: 'save_to_notelab'; unitRef: CognitiveUnitRef; spanHash: string }
  | { type: 'drill_in_study'; unitRef: CognitiveUnitRef }
  | { type: 'continue' }
  | { type: 'stop' };

export interface PauseActionPanel {
  visible: boolean;
  pausedAt: CognitiveUnitRef | null;
  pauseReason: SpeechPauseReason | null;
  availableActions: PauseAction[];
}

// ============================================================================
// NoteLab Integration Types
// ============================================================================

export interface NoteLabReasoningBlock {
  id: string;
  sourceUnitRef: CognitiveUnitRef;
  whiteboardExplanationId: string;
  // User's reasoning capture
  whyItMatters: string;
  whenUsed: string;
  myMistake: string | null;
  // Linked content
  linkedRelationIds: string[];
  linkedClusterIds: string[];
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Study Integration Types
// ============================================================================

export interface StudyRemediation {
  id: string;
  unitRef: CognitiveUnitRef;
  missCount: number;              // Triggers whiteboard at 2+
  lastMissAt: number;
  whiteboardTriggered: boolean;
  whiteboardExplanationId: string | null;
  // After remediation
  postRemediationScore: number | null;
}

export interface StudyListenMode {
  enabled: boolean;
  readPromptsAloud: boolean;
  readExplanationAfterAnswer: boolean;
  voice: string | null;
  rate: number;
}

// ============================================================================
// Service State Types
// ============================================================================

export interface SpeechServiceState {
  currentSession: SpeechSession | null;
  autoPauseConfig: AutoPauseConfig;
  pauseActionPanel: PauseActionPanel;
  availableVoices: SpeechSynthesisVoice[];
  isSupported: boolean;
}

export interface WhiteboardServiceState {
  currentExplanation: WhiteboardExplanation | null;
  isGenerating: boolean;
  isVisible: boolean;
  mode: 'view' | 'interact' | 'edit';
  // History
  explanationHistory: WhiteboardExplanation[];
}
