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
