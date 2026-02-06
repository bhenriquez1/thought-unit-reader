/**
 * ⚡ Core Module
 *
 * Ultra-fast paragraph-aware extraction engine
 */

// Types
export * from './types';

// Schema & Validation
export {
  CORE_LIMITS,
  TriggerEnum,
  CoreItemSchema,
  CoreResponseSchema,
  validateCoreResponse,
  safeParseCoreResponse,
  validateCoreItem,
  countSentences,
  truncateToLimits,
  ParagraphMetaSchema,
  type TriggerType,
  type CoreItemType,
  type CoreResponseType,
  type ParagraphMetaType,
} from './schema';

// Paragraph Extraction
export {
  extractParagraphs,
  buildParagraphMeta,
  findParagraphAtScroll,
  getParagraphWindow,
  extractViewportParagraphs,
  getCombinedText,
  findParagraphForChar,
  toLocalCharRange,
  createScrollDebouncer,
  generateWindowCacheKey,
} from './paragraphExtractor';

// Core Extraction
export {
  extractCore,
  extractFromPage,
  clearCache,
  getPrompts,
  type ExtractionResult,
} from './coreExtractor';

// Learning Engine
export {
  LEARNING_CONFIG,
  initializeLearning,
  processReview,
  getDueItems,
  sortByPriority,
  getStudyStats,
  initializeBatch,
  getNextReviewItem,
  type ReviewGrade,
  type ReviewResult,
} from './learningEngine';

// Analytics
export {
  calculateKnowledgeDebt,
  calculateExamReadiness,
  calculateTimeToExam,
  calculatePassFailMeter,
  type KnowledgeDebt,
  type ExamReadiness,
  type TimeToExamForecast,
  type ExamConfig,
  type RecallAttempt,
  type PassFailMeter,
} from './analytics';

// Auto-Notes
export {
  generateAutoNotes,
  filterNotesByType,
  filterNotesByTrigger,
  filterNotesByPriority,
  getHighPriorityNotes,
  getAttentionNotes,
  organizeNotes,
  type AutoNote,
  type NoteType,
  type AutoNotesResult,
  type OrganizedNotes,
} from './autoNotes';

// Pipeline (Two-Tier Extraction)
export {
  PIPELINE_LIMITS,
  runPipeline,
  tierAExtract,
  createStreamController,
  extractVisibleText,
  buildMicroChunks,
  findCenterChunk,
  truncateInput,
  clearPipelineCache,
  type ExtractionTier,
  type ExtractionSource,
  type PipelineRequest,
  type PipelineResult,
  type TextItem,
  type ViewportWindow,
  type MicroChunk,
} from './pipeline';

// Autopilot
export {
  generateDailyQueue,
  startSession,
  getCurrentItem,
  recordResult,
  getProgress,
  getSessionStats,
  getTodaySummary,
  type SessionPhase,
  type DailyQueueItem,
  type DailyQueue,
  type AutopilotSession,
  type SessionResult,
  type AutopilotConfig,
} from './autopilot';

// Core Flashcards
export {
  coreItemToFlashcard,
  generateCoreFlashcards,
  getCoreFlashcardsByPriority,
  getDueCoreFlashcards,
  getWeakCoreFlashcards,
  getCoreFlashcardStats,
  type CoreFlashcard,
} from './coreFlashcards';
