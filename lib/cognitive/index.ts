// lib/cognitive/index.ts
// Expert View 2.1 - Cognitive Engines Module
// Page-aware extraction, priority, insights, flashcards, notes

// Types
export * from './types';

// Stores
export { usePageContextStore } from './pageContextStore';
export { useExpertViewStore } from './expertViewStore';
export { useNoteLabStore2 } from './noteLabStore';
export { useStudyDashboardStore } from './studyDashboardStore';

// Engines
export { importanceEngine, scoreCard, scoreCards, rankCards } from './importanceEngine';
export { datApexEngine } from './datApexEngine';
export { clinicalReasoningEngine } from './clinicalReasoningEngine';
export { smartSpeechEngine, generateSpeechText, getChunkTiming, planFromCards } from './smartSpeechEngine';
export {
  matchSyllabusToToc,
  findTopKMatches,
  getSyllabusMatchForPage,
  getPageRangesForSyllabusItem,
  getTocNodesForSyllabusItem,
} from './syllabusMatchingEngine';
