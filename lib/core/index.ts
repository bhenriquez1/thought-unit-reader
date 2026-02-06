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
