// lib/engines/index.ts
// Export all engine modules

// Types
export * from './types';

// Extraction Engine
export {
  extractPage,
  extractChapter,
  getCurrentPageText,
  clearExtractionCache,
  getExtractionFromCache,
  extractionCache,
  type ExtractPageOptions,
  type ExtractChapterOptions,
  type ChapterRange,
  type PageTextSource,
} from './extractionEngine';

// Insights Engine
export {
  generateInsights,
  detectPatterns,
  generateWhatMatters,
  generateWhatMissing,
} from './insightsEngine';

// Explain Engine
export {
  generateExplain,
  generateTitle,
  generateSteps,
  generateDrawInstructions,
  generateExamQuestions,
  generateMnemonic,
  type GenerateExplainOptions,
} from './explainEngine';

// Study Card Engine
export {
  generateCardsFromInsights,
  getCardsForDocument,
  getDueCards,
  updateCardSRS,
  deleteCard,
  getCardStats,
  insightToCard,
  type GenerateCardsOptions,
} from './studyCardEngine';

// Reasoning Flow Engine
export {
  buildReasoningFlow,
  getReasoningStats,
  inferNodeType,
  detectMissingNodes,
  EDGE_PATTERNS,
  NODE_TYPE_PATTERNS,
  EXPECTED_STRUCTURE,
} from './reasoningFlowEngine';
