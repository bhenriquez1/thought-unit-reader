/**
 * Universal Thought-Unit Extractor with Cognitive Compression
 *
 * Extracts concepts from text with:
 * - Core sentence (1 sentence max)
 * - Exception triggers A-H for expanding beyond core
 * - Attachment triggers P/X/V for supplementary content
 * - Automatic stop reason tracking
 */

// ============================================================================
// Types
// ============================================================================

export interface ConceptOutput {
  id: string;
  core_sentence: string;           // The single most important sentence
  exceptions: ExceptionItem[];     // Additional sentences triggered by A-H rules
  attachments: AttachmentItem[];   // Supplementary content triggered by P/X/V
  sentence_count: number;          // Total sentences extracted
  stop_reason: StopReason;         // Why extraction stopped
  page_type: PageType;             // Classification of the source page
  confidence: number;              // 0-1 extraction confidence
  metadata: ConceptMetadata;
}

export interface ExceptionItem {
  trigger: ExceptionTrigger;
  content: string;
  label: string;                   // Human-readable trigger label
}

export interface AttachmentItem {
  trigger: AttachmentTrigger;
  content: string;
  reference?: string;              // Figure number, example ID, etc.
}

export interface ConceptMetadata {
  sourceText: string;
  pageNumber: number;
  extractedAt: number;
  processingTimeMs: number;
}

// Exception Triggers A-H: When to expand beyond 1 sentence
export type ExceptionTrigger =
  | 'A_CONDITIONAL'      // "If X, then Y" - conditions that change the rule
  | 'B_CONTRAST'         // "However/But" - important contrasting information
  | 'C_CAUSATION'        // "Because/Therefore" - causal chain completion
  | 'D_DEFINITION'       // Technical term requires its definition
  | 'E_ENUMERATION'      // List items that are inseparable from the concept
  | 'F_FORMULA'          // Mathematical/chemical formula with explanation
  | 'G_GRADATION'        // "Mild/Moderate/Severe" - severity or staging
  | 'H_HIERARCHY'        // Parent-child relationships essential to concept

// Attachment Triggers P/X/V: Supplementary content
export type AttachmentTrigger =
  | 'P_PROCEDURE'        // Step-by-step process
  | 'X_EXAMPLE'          // Worked example or case
  | 'V_VISUAL'           // Figure, diagram, or table reference

// Stop Reasons
export type StopReason =
  | 'COMPLETE'           // All relevant content captured
  | 'NO_TRIGGERS'        // No exception triggers found
  | 'MAX_SENTENCES'      // Hit sentence limit (configurable)
  | 'NEW_CONCEPT'        // Detected transition to different concept
  | 'PAGE_END'           // End of page content

// Page Classification
export type PageType =
  | 'DEFINITION'         // Primarily definitional content
  | 'EXAMPLE'            // Worked examples or cases
  | 'PROCEDURE'          // Step-by-step instructions
  | 'FIGURE'             // Figure-heavy page
  | 'EXERCISES'          // Practice problems
  | 'NARRATIVE'          // Explanatory text
  | 'MIXED'              // Multiple types

// ============================================================================
// Detection Patterns
// ============================================================================

const EXCEPTION_PATTERNS: Record<ExceptionTrigger, RegExp[]> = {
  A_CONDITIONAL: [
    /\b(if|when|unless|provided that|in case of|except when)\b/i,
    /\b(only if|assuming|given that|supposing)\b/i,
  ],
  B_CONTRAST: [
    /\b(however|but|although|whereas|while|yet|nevertheless)\b/i,
    /\b(in contrast|on the other hand|conversely|unlike)\b/i,
    /\b(despite|rather than|instead of)\b/i,
  ],
  C_CAUSATION: [
    /\b(because|therefore|thus|hence|consequently|as a result)\b/i,
    /\b(due to|owing to|caused by|leads to|results in)\b/i,
    /\b(so that|in order to|for this reason)\b/i,
  ],
  D_DEFINITION: [
    /\b(is defined as|refers to|means|known as)\b/i,
    /\b(i\.e\.|that is|namely|specifically)\b/i,
    /:\s*$/,  // Colon at end often precedes definition
  ],
  E_ENUMERATION: [
    /\b(include|including|such as|for example|namely)\b/i,
    /\b(first|second|third|finally|additionally)\b/i,
    /^\s*[\d]+[.)]\s/m,  // Numbered lists
    /^\s*[•\-\*]\s/m,    // Bullet lists
  ],
  F_FORMULA: [
    /[A-Z][a-z]?\d*[+\-→=]/,  // Chemical formulas
    /\b(formula|equation|calculate|compute)\b/i,
    /[=×÷\+\-]\s*\d/,  // Mathematical expressions
  ],
  G_GRADATION: [
    /\b(mild|moderate|severe|grade [IVX\d]+)\b/i,
    /\b(stage [IVX\d]+|class [IVX\d]+|type [IVX\d]+)\b/i,
    /\b(minimal|partial|complete|total)\b/i,
    /\b(early|intermediate|advanced|terminal)\b/i,
  ],
  H_HIERARCHY: [
    /\b(consists of|composed of|divided into|classified as)\b/i,
    /\b(types include|subtypes|subcategories|branches)\b/i,
    /\b(parent|child|primary|secondary)\b/i,
  ],
};

const ATTACHMENT_PATTERNS: Record<AttachmentTrigger, RegExp[]> = {
  P_PROCEDURE: [
    /\b(step \d+|procedure|protocol|method|technique)\b/i,
    /\b(first|then|next|finally|begin by|start with)\b/i,
    /\b(perform|carry out|execute|administer)\b/i,
  ],
  X_EXAMPLE: [
    /\b(for example|for instance|e\.g\.|such as|consider)\b/i,
    /\b(case|patient|scenario|situation|problem)\b/i,
    /\b(sample|illustration|demonstration)\b/i,
  ],
  V_VISUAL: [
    /\b(figure|fig\.|diagram|chart|table|graph|image)\s*\d*/i,
    /\b(see|refer to|shown in|illustrated in|depicted)\b/i,
    /\b(visual|schematic|representation)\b/i,
  ],
};

const PAGE_TYPE_PATTERNS: Record<PageType, RegExp[]> = {
  DEFINITION: [
    /\b(definition|defined as|is called|refers to|meaning)\b/i,
    /\b(terminology|glossary|key terms)\b/i,
  ],
  EXAMPLE: [
    /\b(example|case study|problem|solution|worked)\b/i,
    /\b(sample|practice|exercise \d+)\b/i,
  ],
  PROCEDURE: [
    /\b(procedure|protocol|steps|instructions|how to)\b/i,
    /\b(method|technique|process|workflow)\b/i,
  ],
  FIGURE: [
    /\b(figure|diagram|chart|graph|illustration)\s*\d+/i,
  ],
  EXERCISES: [
    /\b(exercise|problem set|questions|quiz|test)\b/i,
    /\b(solve|calculate|determine|find)\b/i,
  ],
  NARRATIVE: [
    /\b(introduction|overview|background|history)\b/i,
    /\b(discussion|analysis|interpretation)\b/i,
  ],
  MIXED: [], // Fallback
};

// ============================================================================
// Extraction Engine
// ============================================================================

export interface ExtractionConfig {
  maxSentences: number;
  minConfidence: number;
  enableAI: boolean;
}

const DEFAULT_CONFIG: ExtractionConfig = {
  maxSentences: 7,
  minConfidence: 0.6,
  enableAI: false,
};

/**
 * Split text into sentences with improved handling
 */
function splitSentences(text: string): string[] {
  // Handle common abbreviations that contain periods
  const protected_text = text
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof|Jr|Sr)\./gi, '$1<DOT>')
    .replace(/\b(e\.g|i\.e|vs|etc)\./gi, '$1<DOT>')
    .replace(/\b(Fig|Tab|Eq)\.\s*(\d)/gi, '$1<DOT> $2');

  // Split on sentence boundaries
  const raw_sentences = protected_text.split(/(?<=[.!?])\s+(?=[A-Z])/);

  // Restore protected periods and clean up
  return raw_sentences
    .map(s => s.replace(/<DOT>/g, '.').trim())
    .filter(s => s.length > 10);  // Filter out very short fragments
}

/**
 * Detect which exception triggers are present in a sentence
 */
function detectExceptionTriggers(sentence: string): ExceptionTrigger[] {
  const triggers: ExceptionTrigger[] = [];

  for (const [trigger, patterns] of Object.entries(EXCEPTION_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(sentence)) {
        triggers.push(trigger as ExceptionTrigger);
        break;
      }
    }
  }

  return triggers;
}

/**
 * Detect which attachment triggers are present in a sentence
 */
function detectAttachmentTriggers(sentence: string): AttachmentTrigger[] {
  const triggers: AttachmentTrigger[] = [];

  for (const [trigger, patterns] of Object.entries(ATTACHMENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(sentence)) {
        triggers.push(trigger as AttachmentTrigger);
        break;
      }
    }
  }

  return triggers;
}

/**
 * Classify page type based on content
 */
export function classifyPageType(text: string): PageType {
  const scores: Record<PageType, number> = {
    DEFINITION: 0,
    EXAMPLE: 0,
    PROCEDURE: 0,
    FIGURE: 0,
    EXERCISES: 0,
    NARRATIVE: 0,
    MIXED: 0,
  };

  for (const [type, patterns] of Object.entries(PAGE_TYPE_PATTERNS)) {
    for (const pattern of patterns) {
      const matches = text.match(new RegExp(pattern, 'gi'));
      if (matches) {
        scores[type as PageType] += matches.length;
      }
    }
  }

  // Find the highest scoring type
  let maxType: PageType = 'NARRATIVE';
  let maxScore = 0;
  let secondScore = 0;

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      secondScore = maxScore;
      maxScore = score;
      maxType = type as PageType;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  // If scores are close, it's mixed content
  if (maxScore > 0 && secondScore > 0 && (secondScore / maxScore) > 0.7) {
    return 'MIXED';
  }

  return maxScore > 0 ? maxType : 'NARRATIVE';
}

/**
 * Get human-readable label for exception trigger
 */
function getTriggerLabel(trigger: ExceptionTrigger): string {
  const labels: Record<ExceptionTrigger, string> = {
    A_CONDITIONAL: 'Condition',
    B_CONTRAST: 'Contrast',
    C_CAUSATION: 'Cause/Effect',
    D_DEFINITION: 'Definition',
    E_ENUMERATION: 'List',
    F_FORMULA: 'Formula',
    G_GRADATION: 'Severity/Stage',
    H_HIERARCHY: 'Classification',
  };
  return labels[trigger];
}

/**
 * Score sentence importance for core selection
 */
function scoreSentenceImportance(sentence: string, index: number, total: number): number {
  let score = 0.5;

  // First sentence bonus
  if (index === 0) score += 0.2;

  // Contains key definition markers
  if (/\b(is|are|refers to|defined as|means)\b/i.test(sentence)) score += 0.15;

  // Contains important quantifiers
  if (/\b(most|always|never|all|none|primary|main|key)\b/i.test(sentence)) score += 0.1;

  // Longer sentences often contain more information
  const wordCount = sentence.split(/\s+/).length;
  if (wordCount > 15 && wordCount < 40) score += 0.1;

  // Penalty for example sentences (they support, not define)
  if (/\b(for example|such as|e\.g\.)\b/i.test(sentence)) score -= 0.2;

  return Math.min(1, Math.max(0, score));
}

/**
 * Main extraction function - extracts concepts with cognitive compression
 */
export function extractConcept(
  text: string,
  pageNumber: number,
  config: Partial<ExtractionConfig> = {}
): ConceptOutput {
  const startTime = performance.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return createEmptyOutput(text, pageNumber, startTime);
  }

  // Score sentences and select core
  const scored = sentences.map((s, i) => ({
    sentence: s,
    score: scoreSentenceImportance(s, i, sentences.length),
    index: i,
  }));

  scored.sort((a, b) => b.score - a.score);
  const coreSentence = scored[0].sentence;
  const coreIndex = scored[0].index;

  // Process remaining sentences for exceptions and attachments
  const exceptions: ExceptionItem[] = [];
  const attachments: AttachmentItem[] = [];
  let stopReason: StopReason = 'COMPLETE';

  for (let i = 0; i < sentences.length && exceptions.length < cfg.maxSentences - 1; i++) {
    if (i === coreIndex) continue;  // Skip core sentence

    const sentence = sentences[i];
    const exceptionTriggers = detectExceptionTriggers(sentence);
    const attachmentTriggers = detectAttachmentTriggers(sentence);

    // Add exception items
    for (const trigger of exceptionTriggers) {
      exceptions.push({
        trigger,
        content: sentence,
        label: getTriggerLabel(trigger),
      });
      break;  // One trigger per sentence
    }

    // Add attachment items (can coexist with exceptions)
    for (const trigger of attachmentTriggers) {
      attachments.push({
        trigger,
        content: sentence,
        reference: extractReference(sentence, trigger),
      });
      break;
    }
  }

  // Determine stop reason
  if (exceptions.length >= cfg.maxSentences - 1) {
    stopReason = 'MAX_SENTENCES';
  } else if (exceptions.length === 0 && attachments.length === 0) {
    stopReason = 'NO_TRIGGERS';
  }

  const pageType = classifyPageType(text);
  const confidence = calculateConfidence(coreSentence, exceptions, pageType);

  return {
    id: generateId(),
    core_sentence: coreSentence,
    exceptions,
    attachments,
    sentence_count: 1 + exceptions.length,
    stop_reason: stopReason,
    page_type: pageType,
    confidence,
    metadata: {
      sourceText: text,
      pageNumber,
      extractedAt: Date.now(),
      processingTimeMs: performance.now() - startTime,
    },
  };
}

/**
 * Extract multiple concepts from a page (for pages with multiple distinct topics)
 */
export function extractConceptsFromPage(
  text: string,
  pageNumber: number,
  config: Partial<ExtractionConfig> = {}
): ConceptOutput[] {
  // Split by paragraph breaks or major transitions
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);

  if (paragraphs.length <= 1) {
    return [extractConcept(text, pageNumber, config)];
  }

  // Check if paragraphs are truly separate concepts or continuation
  const concepts: ConceptOutput[] = [];
  let currentText = '';

  for (const para of paragraphs) {
    // Check for concept transition markers
    const isNewConcept = /^(?:[\d]+[.)]\s|[A-Z][.)]\s|\*\*|#{1,3}\s)/.test(para) ||
                         /\b(Next|Another|Additionally|Furthermore)\b/i.test(para.slice(0, 50));

    if (isNewConcept && currentText) {
      concepts.push(extractConcept(currentText, pageNumber, config));
      currentText = para;
    } else {
      currentText += '\n\n' + para;
    }
  }

  // Don't forget the last accumulated text
  if (currentText) {
    concepts.push(extractConcept(currentText, pageNumber, config));
  }

  return concepts;
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateId(): string {
  return `concept_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function createEmptyOutput(text: string, pageNumber: number, startTime: number): ConceptOutput {
  return {
    id: generateId(),
    core_sentence: '',
    exceptions: [],
    attachments: [],
    sentence_count: 0,
    stop_reason: 'PAGE_END',
    page_type: 'NARRATIVE',
    confidence: 0,
    metadata: {
      sourceText: text,
      pageNumber,
      extractedAt: Date.now(),
      processingTimeMs: performance.now() - startTime,
    },
  };
}

function extractReference(sentence: string, trigger: AttachmentTrigger): string | undefined {
  if (trigger === 'V_VISUAL') {
    const match = sentence.match(/\b(figure|fig\.|table|chart|graph)\s*(\d+[a-z]?)/i);
    return match ? `${match[1]} ${match[2]}` : undefined;
  }
  return undefined;
}

function calculateConfidence(
  core: string,
  exceptions: ExceptionItem[],
  pageType: PageType
): number {
  let confidence = 0.5;

  // Core sentence quality
  if (core.length > 30 && core.length < 200) confidence += 0.15;
  if (/\b(is|are|means|refers)\b/i.test(core)) confidence += 0.1;

  // Exception diversity bonus
  const uniqueTriggers = new Set(exceptions.map(e => e.trigger));
  confidence += Math.min(0.15, uniqueTriggers.size * 0.05);

  // Page type confidence
  if (pageType !== 'MIXED' && pageType !== 'NARRATIVE') confidence += 0.1;

  return Math.min(1, Math.max(0, confidence));
}

// ============================================================================
// Exports for Testing
// ============================================================================

export const _testing = {
  splitSentences,
  detectExceptionTriggers,
  detectAttachmentTriggers,
  scoreSentenceImportance,
  getTriggerLabel,
};
