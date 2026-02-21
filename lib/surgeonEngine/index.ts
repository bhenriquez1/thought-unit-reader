// lib/surgeonEngine/index.ts
// Surgeon Engine - Dental/Medical-First Reasoning Platform
// Exports all engines, types, and store

// Types
export type {
  ID,
  ISODate,
  ISODateTime,
  ExamDomain,
  ConfidenceBand,
  ReasonCode,
  UnitKind,
  BookMeta,
  TocNode,
  ExtractedUnit,
  SyllabusItem,
  MappingCandidate,
  SyllabusMappingResult,
  UserTrainingSignal,
  ImportanceLabel,
  ImportanceSignals,
  ImportanceScore,
  TrapType,
  TrapTag,
  PatternType,
  EvidenceRef,
  Pattern,
  PatternCluster,
  ClinicalScaffold,
  ExpertViewPayload,
  SurgeonEngineState,
} from './types';

// Engines
export { scoreUnit, scoreAllUnits, rankUnits, computeSignals } from './importanceEngine';
export { detectTraps, detectAllTraps, getTrapStats } from './trapDetector';
export { extractPatterns, extractAllPatterns, clusterPatterns, runPatternPipeline } from './patternEngine';
export { buildScaffold, buildScaffoldFromCluster, buildScaffoldFromUnit, isScaffoldMeaningful } from './clinicalScaffold';
export {
  buildClinicalScaffold,
  buildClusterScaffolds,
  isPageScaffoldMeaningful,
  extractMechanismObservations,
  extractDefinitionHypotheses,
  extractStepwiseProcess,
  extractClinicalCorrelation,
  extractDATTrapDecisions,
  extractHighYieldSummary,
  extractTreatmentActions,
} from './clinicalScaffolds';
export type { ScaffoldContext } from './clinicalScaffolds';
export { matchSyllabusItem, runSyllabusMatchingPipeline, applyTrainingSignal } from './syllabusMatchingEngine';
export { buildExpertViewPayload, getPayloadStats } from './expertViewPayload';

// Store
export { useSurgeonEngineStore } from './store';
