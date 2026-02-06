/**
 * ⚡ Auto-Notes Generator
 *
 * Automatically generates study notes from Core items:
 * - Core sentences → Main concepts
 * - Exceptions → Important caveats
 * - Triggers → Categorized learning
 * - Flashcards → Q&A pairs
 * - Recall mistakes → Focus areas
 */

import type { CoreItem, CoreItemWithLearning, Trigger } from './types';
import { TRIGGER_LABELS } from './types';
import type { RecallAttempt } from './analytics';

// ============================================================================
// Types
// ============================================================================

export type NoteType =
  | 'concept'      // Core sentence
  | 'exception'    // Exception to a rule
  | 'procedure'    // Step-by-step process
  | 'example'      // Concrete example
  | 'flashcard'    // Q&A pair
  | 'mistake'      // Recall mistake to focus on
  | 'connection';  // Link between concepts

export interface AutoNote {
  id: string;
  type: NoteType;
  content: string;
  /** Source Core item ID */
  sourceId: string;
  /** Related trigger types */
  triggers: Trigger[];
  /** Priority for study (0-100) */
  priority: number;
  /** Whether this was from a recall mistake */
  fromMistake: boolean;
  /** Metadata for rendering */
  meta: {
    question?: string;
    answer?: string;
    steps?: string[];
    exampleText?: string;
    relatedItems?: string[];
  };
  /** Creation timestamp */
  createdAt: number;
}

export interface AutoNotesResult {
  notes: AutoNote[];
  stats: {
    totalNotes: number;
    byConcept: number;
    byException: number;
    byProcedure: number;
    byExample: number;
    byFlashcard: number;
    byMistake: number;
  };
}

// ============================================================================
// Note Generation
// ============================================================================

/**
 * Generate all auto-notes from Core items
 */
export function generateAutoNotes(
  items: CoreItemWithLearning[],
  recallHistory: RecallAttempt[] = [],
  options: {
    includeFlashcards?: boolean;
    includeProcedures?: boolean;
    includeExamples?: boolean;
    prioritizeMistakes?: boolean;
  } = {}
): AutoNotesResult {
  const {
    includeFlashcards = true,
    includeProcedures = true,
    includeExamples = true,
    prioritizeMistakes = true,
  } = options;

  const notes: AutoNote[] = [];
  const now = Date.now();

  // Get recent mistakes for prioritization
  const recentMistakes = new Set(
    recallHistory
      .filter((r) => !r.correct && now - r.timestamp < 7 * 24 * 60 * 60 * 1000)
      .map((r) => r.itemId)
  );

  for (const item of items) {
    const isMistake = recentMistakes.has(item.id);
    const basePriority = calculateNotePriority(item, isMistake);

    // 1. Core concept note
    notes.push(createConceptNote(item, basePriority, now));

    // 2. Exception notes
    for (const exception of item.exceptions) {
      notes.push(createExceptionNote(item, exception, basePriority, now));
    }

    // 3. Flashcard note (if available)
    if (includeFlashcards && item.flashcard) {
      notes.push(createFlashcardNote(item, basePriority, now));
    }

    // 4. Procedure note (if available)
    if (includeProcedures && item.attachments_available.procedure) {
      notes.push(createProcedureNote(item, basePriority, now));
    }

    // 5. Example note (if available)
    if (includeExamples && item.attachments_available.example) {
      notes.push(createExampleNote(item, basePriority, now));
    }

    // 6. Mistake focus note
    if (prioritizeMistakes && isMistake) {
      notes.push(createMistakeNote(item, now));
    }
  }

  // Sort by priority (highest first)
  notes.sort((a, b) => b.priority - a.priority);

  return {
    notes,
    stats: {
      totalNotes: notes.length,
      byConcept: notes.filter((n) => n.type === 'concept').length,
      byException: notes.filter((n) => n.type === 'exception').length,
      byProcedure: notes.filter((n) => n.type === 'procedure').length,
      byExample: notes.filter((n) => n.type === 'example').length,
      byFlashcard: notes.filter((n) => n.type === 'flashcard').length,
      byMistake: notes.filter((n) => n.type === 'mistake').length,
    },
  };
}

// ============================================================================
// Note Creation Helpers
// ============================================================================

function createConceptNote(
  item: CoreItemWithLearning,
  basePriority: number,
  timestamp: number
): AutoNote {
  // Format triggers as category labels
  const categoryLabels = item.triggers.map((t) => TRIGGER_LABELS[t]).join(', ');

  return {
    id: `note-${item.id}-concept`,
    type: 'concept',
    content: item.core_sentence,
    sourceId: item.id,
    triggers: item.triggers,
    priority: basePriority,
    fromMistake: false,
    meta: {
      relatedItems: item.exceptions.length > 0 ? [`${item.exceptions.length} exceptions`] : [],
    },
    createdAt: timestamp,
  };
}

function createExceptionNote(
  item: CoreItemWithLearning,
  exception: { trigger: Trigger; sentence: string },
  basePriority: number,
  timestamp: number
): AutoNote {
  return {
    id: `note-${item.id}-exc-${exception.trigger}`,
    type: 'exception',
    content: `Exception (${TRIGGER_LABELS[exception.trigger]}): ${exception.sentence}`,
    sourceId: item.id,
    triggers: [exception.trigger],
    priority: basePriority + 10, // Exceptions are higher priority
    fromMistake: false,
    meta: {
      relatedItems: [item.core_sentence.slice(0, 50) + '...'],
    },
    createdAt: timestamp,
  };
}

function createFlashcardNote(
  item: CoreItemWithLearning,
  basePriority: number,
  timestamp: number
): AutoNote {
  return {
    id: `note-${item.id}-flashcard`,
    type: 'flashcard',
    content: `Q: ${item.flashcard!.front}`,
    sourceId: item.id,
    triggers: item.triggers,
    priority: basePriority + 5,
    fromMistake: false,
    meta: {
      question: item.flashcard!.front,
      answer: item.flashcard!.back,
    },
    createdAt: timestamp,
  };
}

function createProcedureNote(
  item: CoreItemWithLearning,
  basePriority: number,
  timestamp: number
): AutoNote {
  return {
    id: `note-${item.id}-procedure`,
    type: 'procedure',
    content: `Procedure for: ${item.core_sentence.slice(0, 60)}...`,
    sourceId: item.id,
    triggers: item.triggers,
    priority: basePriority,
    fromMistake: false,
    meta: {
      steps: ['(Procedure steps will be lazy-loaded)'],
    },
    createdAt: timestamp,
  };
}

function createExampleNote(
  item: CoreItemWithLearning,
  basePriority: number,
  timestamp: number
): AutoNote {
  return {
    id: `note-${item.id}-example`,
    type: 'example',
    content: `Example for: ${item.core_sentence.slice(0, 60)}...`,
    sourceId: item.id,
    triggers: item.triggers,
    priority: basePriority,
    fromMistake: false,
    meta: {
      exampleText: '(Example will be lazy-loaded)',
    },
    createdAt: timestamp,
  };
}

function createMistakeNote(item: CoreItemWithLearning, timestamp: number): AutoNote {
  return {
    id: `note-${item.id}-mistake`,
    type: 'mistake',
    content: `⚠️ Review: ${item.core_sentence}`,
    sourceId: item.id,
    triggers: item.triggers,
    priority: 100, // Mistakes are highest priority
    fromMistake: true,
    meta: {
      relatedItems: item.exceptions.map((e) => e.sentence),
    },
    createdAt: timestamp,
  };
}

function calculateNotePriority(item: CoreItemWithLearning, isMistake: boolean): number {
  let priority = 50; // Base priority

  // Adjust by learning state
  switch (item.learning.state) {
    case 'weak':
      priority += 30;
      break;
    case 'new':
      priority += 20;
      break;
    case 'learning':
      priority += 15;
      break;
    case 'review':
      priority += 5;
      break;
    case 'mastered':
      priority -= 20;
      break;
  }

  // Adjust by confidence (lower confidence = higher priority)
  priority += Math.round((1 - item.learning.combinedConfidence) * 20);

  // Boost for mistakes
  if (isMistake) {
    priority += 25;
  }

  // Boost for high-value triggers
  if (item.triggers.includes('A')) priority += 5; // Conditionals
  if (item.triggers.includes('F')) priority += 5; // Formulas

  return Math.min(100, Math.max(0, priority));
}

// ============================================================================
// Note Filtering
// ============================================================================

/**
 * Filter notes by type
 */
export function filterNotesByType(notes: AutoNote[], types: NoteType[]): AutoNote[] {
  return notes.filter((n) => types.includes(n.type));
}

/**
 * Filter notes by trigger
 */
export function filterNotesByTrigger(notes: AutoNote[], triggers: Trigger[]): AutoNote[] {
  return notes.filter((n) => n.triggers.some((t) => triggers.includes(t)));
}

/**
 * Filter notes by priority threshold
 */
export function filterNotesByPriority(notes: AutoNote[], minPriority: number): AutoNote[] {
  return notes.filter((n) => n.priority >= minPriority);
}

/**
 * Get high-priority notes for quick review
 */
export function getHighPriorityNotes(notes: AutoNote[], limit: number = 10): AutoNote[] {
  return notes.slice(0, limit);
}

/**
 * Get notes that need attention (mistakes + weak items)
 */
export function getAttentionNotes(notes: AutoNote[]): AutoNote[] {
  return notes.filter((n) => n.fromMistake || n.priority >= 70);
}

// ============================================================================
// Note Organization
// ============================================================================

export interface OrganizedNotes {
  byType: Record<NoteType, AutoNote[]>;
  byTrigger: Record<Trigger, AutoNote[]>;
  byPriority: {
    urgent: AutoNote[];
    high: AutoNote[];
    medium: AutoNote[];
    low: AutoNote[];
  };
}

/**
 * Organize notes for display
 */
export function organizeNotes(notes: AutoNote[]): OrganizedNotes {
  const byType: Record<NoteType, AutoNote[]> = {
    concept: [],
    exception: [],
    procedure: [],
    example: [],
    flashcard: [],
    mistake: [],
    connection: [],
  };

  const byTrigger: Record<Trigger, AutoNote[]> = {
    A: [], B: [], C: [], D: [], E: [], F: [], G: [], H: [],
  };

  const byPriority = {
    urgent: [] as AutoNote[],
    high: [] as AutoNote[],
    medium: [] as AutoNote[],
    low: [] as AutoNote[],
  };

  for (const note of notes) {
    // By type
    byType[note.type].push(note);

    // By trigger
    for (const trigger of note.triggers) {
      byTrigger[trigger].push(note);
    }

    // By priority
    if (note.priority >= 80) {
      byPriority.urgent.push(note);
    } else if (note.priority >= 60) {
      byPriority.high.push(note);
    } else if (note.priority >= 40) {
      byPriority.medium.push(note);
    } else {
      byPriority.low.push(note);
    }
  }

  return { byType, byTrigger, byPriority };
}
