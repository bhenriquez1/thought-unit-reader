// lib/speechWhiteboard/index.ts
// Speech + Whiteboard Integration Exports

// Types
export type {
  CognitiveUnitType,
  CognitiveUnitRef,
  SpeechPauseReason,
  SpeechSession,
  SpeechSessionActions,
  AutoPauseConfig,
  WhiteboardStep,
  WhiteboardGraphNode,
  WhiteboardGraphEdge,
  WhiteboardExplanation,
  DecisionRuleCandidate,
  PauseAction,
  PauseActionPanel,
  NoteLabReasoningBlock,
  StudyRemediation,
  StudyListenMode,
  SpeechServiceState,
  WhiteboardServiceState,
} from './types';

// Services
export { useSpeechService, getClusterSpans, getRelationSpans } from './speechService';
export { useWhiteboardService } from './whiteboardService';
