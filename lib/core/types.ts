/**
 * ⚡ Core Extraction Types
 *
 * Decision-compression engine types with strict limits:
 * - Max 8 items per extraction
 * - Max 12 total sentences
 * - Max 160 chars per sentence
 * - Max 3 triggers per item
 * - Max 2 exceptions per item
 */

// Exception/Enhancement Triggers A-H
export type Trigger = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';

export const TRIGGER_LABELS: Record<Trigger, string> = {
  A: 'Conditional',      // IF-THEN rules
  B: 'Contrast',         // BUT, HOWEVER, EXCEPT
  C: 'Causation',        // BECAUSE, THEREFORE
  D: 'Definition',       // IS, MEANS, REFERS TO
  E: 'Enumeration',      // LIST, STEPS, TYPES
  F: 'Formula',          // EQUATION, CALCULATION
  G: 'Gradation',        // SCALE, SPECTRUM, RANGE
  H: 'Hierarchy',        // PARENT-CHILD, CLASSIFICATION
};

// Core item extracted from text
export interface CoreItem {
  id: string;
  core_sentence: string;  // Max 160 chars
  triggers: Trigger[];    // Max 3
  exceptions: {
    trigger: Trigger;
    sentence: string;     // Max 160 chars
  }[];                    // Max 2
  confidence: number;     // 0-1
  source: {
    page: number | null;
    paragraph_index: number | null;
    char_range: [number, number];
  };
  attachments_available: {
    procedure: boolean;
    example: boolean;
    visual: boolean;
  };
}

// Full response from Core extraction
export interface CoreResponse {
  version: 'core.v1';
  scope: {
    book_id: string;
    chapter: string | null;
    page: number | null;
    paragraph_range: [number, number];
  };
  items: CoreItem[];      // Max 8
  stats: {
    input_paragraphs: number;
    items_returned: number;
    sentences_total: number;  // Max 12
  };
  stop_reason: 'clarity_reached' | 'cap_reached';
}

// Paragraph metadata for scroll mapping
export interface ParagraphMeta {
  index: number;
  topPx: number;
  bottomPx: number;
  text: string;
  charStart: number;
  charEnd: number;
}

// Extraction request
export interface CoreExtractionRequest {
  bookId: string;
  chapter: string | null;
  page: number;
  paragraphs: string[];
  paragraphRange: [number, number];
}

// Learning state for spaced repetition
export type LearningState = 'new' | 'learning' | 'review' | 'weak' | 'mastered';

// Core item with learning data
export interface CoreItemWithLearning extends CoreItem {
  learning: {
    state: LearningState;
    modelConfidence: number;      // From extraction (trigger/exception count)
    learnerConfidence: number;    // From review outcomes
    combinedConfidence: number;   // Final score for scheduling
    nextReviewAt: number | null;  // Timestamp
    reviewCount: number;
    correctCount: number;
    lastReviewAt: number | null;
    intervalDays: number;
    easeFactor: number;           // SM-2 ease factor
  };
  flashcard: {
    front: string;
    back: string;
    type: 'definition' | 'decision' | 'mechanism' | 'contrast';
  } | null;
}

// Attachment types (lazy-loaded)
export interface ProcedureAttachment {
  steps: string[];
  preconditions?: string[];
  postconditions?: string[];
}

export interface ExampleAttachment {
  problem: string;
  solution: string[];
  keyInsight: string;
}

export interface VisualAttachment {
  description: string;
  whatToLookFor: string[];
  figureReference?: string;
}

export type Attachment =
  | { type: 'procedure'; data: ProcedureAttachment }
  | { type: 'example'; data: ExampleAttachment }
  | { type: 'visual'; data: VisualAttachment };
