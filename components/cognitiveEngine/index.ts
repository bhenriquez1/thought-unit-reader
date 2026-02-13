// components/cognitiveEngine/index.ts
// Cognitive Engine Component Exports

export { ClinicalInsightPanel } from './ClinicalInsightPanel';
export { ClinicalIQDashboard } from './ClinicalIQDashboard';
export { ReasoningLoopFlow } from './ReasoningLoopFlow';
export { CognitiveNoteLab } from './CognitiveNoteLab';
export { CognitiveTrainingEngine } from './CognitiveTrainingEngine';
export { ExpertModePanel } from './ExpertModePanel';

// Re-export store
export { useCognitiveEngineStore } from '../../lib/cognitiveEngine/store';

// Re-export types
export type {
  ClinicalInsight,
  DecisionRule,
  ReasoningLoop,
  ClinicalIQProfile,
  ExpertModeConfig,
  DATModeConfig,
  CognitiveNote,
  CognitiveTrainingSession,
  TrainingLevel,
} from '../../lib/cognitiveEngine/types';
