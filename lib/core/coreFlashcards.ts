/**
 * Core Flashcard Generator
 *
 * Converts Core items to study flashcards with intelligent front/back generation.
 * Priority order: Core-derived > saved/edited > legacy highlight-based
 */

import type { CoreItem, CoreItemWithLearning, Trigger, LearningState } from './types';
import { TRIGGER_LABELS } from './types';

// ============================================================================
// Types
// ============================================================================

export interface CoreFlashcard {
  id: string;
  coreItemId: string;
  front: string;
  back: string;
  type: 'definition' | 'decision' | 'mechanism' | 'contrast' | 'recall';
  triggers: Trigger[];
  priority: number;       // Higher = more urgent
  source: 'core';
  pageNumber: number | null;
  learningState: LearningState;
  dueAt: number | null;   // Timestamp for due reviews
}

// ============================================================================
// Flashcard Generation
// ============================================================================

/**
 * Determine flashcard type from Core item triggers
 */
function determineFlashcardType(item: CoreItem): CoreFlashcard['type'] {
  const { triggers } = item;

  // Priority order for type determination
  if (triggers.includes('D')) return 'definition';  // IS, MEANS
  if (triggers.includes('A')) return 'decision';    // IF-THEN
  if (triggers.includes('C')) return 'mechanism';   // BECAUSE, THEREFORE
  if (triggers.includes('B')) return 'contrast';    // BUT, EXCEPT

  return 'recall';
}

/**
 * Generate the front (question) side of a flashcard
 */
function generateFront(item: CoreItem, type: CoreFlashcard['type']): string {
  const { core_sentence, triggers } = item;

  // Extract key concept from sentence
  const sentence = core_sentence.trim();

  switch (type) {
    case 'definition':
      // "X is Y" → "What is X?"
      const defMatch = sentence.match(/^(.+?)\s+(?:is|means|refers to|are)\s+/i);
      if (defMatch) {
        return `What is ${defMatch[1].trim()}?`;
      }
      return `Define: ${extractKeyTerms(sentence)}`;

    case 'decision':
      // "If X then Y" → "When X happens, what should you do?"
      const ifMatch = sentence.match(/^(?:if|when)\s+(.+?)[,\s]+(?:then\s+)?(.+)/i);
      if (ifMatch) {
        return `When ${ifMatch[1].trim()}, what happens?`;
      }
      return `What is the decision rule for: ${extractKeyTerms(sentence)}?`;

    case 'mechanism':
      // "X because Y" → "Why does X occur?"
      const causeMatch = sentence.match(/^(.+?)\s+(?:because|therefore|thus|hence|so)\s+/i);
      if (causeMatch) {
        return `Why: ${causeMatch[1].trim()}?`;
      }
      return `Explain the mechanism: ${extractKeyTerms(sentence)}`;

    case 'contrast':
      // "X but Y" → "What is the contrast/exception?"
      return `What is the exception or contrast: ${extractKeyTerms(sentence)}?`;

    default:
      // Generic recall
      return `Recall: ${extractKeyTerms(sentence)}`;
  }
}

/**
 * Generate the back (answer) side of a flashcard
 */
function generateBack(item: CoreItem): string {
  let answer = item.core_sentence;

  // Add exceptions if present
  if (item.exceptions.length > 0) {
    const exceptionsText = item.exceptions
      .map(e => `${TRIGGER_LABELS[e.trigger]}: ${e.sentence}`)
      .join('\n');
    answer += `\n\nExceptions:\n${exceptionsText}`;
  }

  return answer;
}

/**
 * Extract key terms from a sentence (first noun phrase or significant words)
 */
function extractKeyTerms(sentence: string): string {
  // Remove common filler words and get the first meaningful chunk
  const cleaned = sentence
    .replace(/^(the|a|an|this|that|these|those)\s+/i, '')
    .replace(/[.!?]$/, '');

  // Limit to first ~50 chars for question preview
  if (cleaned.length > 50) {
    const words = cleaned.split(/\s+/);
    let result = '';
    for (const word of words) {
      if ((result + ' ' + word).length > 50) break;
      result += (result ? ' ' : '') + word;
    }
    return result + '...';
  }

  return cleaned;
}

/**
 * Calculate flashcard priority based on learning state and due date
 */
function calculatePriority(item: CoreItemWithLearning): number {
  const { learning } = item;
  let priority = 0;

  // Base priority by learning state
  switch (learning.state) {
    case 'weak': priority = 100; break;      // Highest - needs remediation
    case 'learning': priority = 75; break;   // Active learning
    case 'new': priority = 50; break;        // New items
    case 'review': priority = 25; break;     // Scheduled review
    case 'mastered': priority = 10; break;   // Low priority
  }

  // Boost if due or overdue
  if (learning.nextReviewAt) {
    const now = Date.now();
    const dueIn = learning.nextReviewAt - now;

    if (dueIn <= 0) {
      // Overdue - boost significantly
      priority += Math.min(50, Math.abs(dueIn) / (1000 * 60 * 60 * 24)); // +1 per day overdue
    } else if (dueIn < 1000 * 60 * 60 * 24) {
      // Due within 24 hours
      priority += 10;
    }
  }

  // Lower confidence = higher priority
  priority += Math.round((1 - learning.combinedConfidence) * 20);

  return priority;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a flashcard from a Core item
 */
export function coreItemToFlashcard(item: CoreItemWithLearning): CoreFlashcard {
  // Use pre-generated flashcard if available
  if (item.flashcard) {
    return {
      id: `fc_${item.id}`,
      coreItemId: item.id,
      front: item.flashcard.front,
      back: item.flashcard.back,
      type: item.flashcard.type,
      triggers: item.triggers,
      priority: calculatePriority(item),
      source: 'core',
      pageNumber: item.source.page,
      learningState: item.learning.state,
      dueAt: item.learning.nextReviewAt,
    };
  }

  // Generate flashcard on-the-fly
  const type = determineFlashcardType(item);

  return {
    id: `fc_${item.id}`,
    coreItemId: item.id,
    front: generateFront(item, type),
    back: generateBack(item),
    type,
    triggers: item.triggers,
    priority: calculatePriority(item),
    source: 'core',
    pageNumber: item.source.page,
    learningState: item.learning.state,
    dueAt: item.learning.nextReviewAt,
  };
}

/**
 * Generate flashcards from multiple Core items
 */
export function generateCoreFlashcards(items: CoreItemWithLearning[]): CoreFlashcard[] {
  return items.map(coreItemToFlashcard);
}

/**
 * Get flashcards sorted by priority (highest first)
 */
export function getCoreFlashcardsByPriority(items: CoreItemWithLearning[]): CoreFlashcard[] {
  return generateCoreFlashcards(items).sort((a, b) => b.priority - a.priority);
}

/**
 * Get due flashcards only
 */
export function getDueCoreFlashcards(items: CoreItemWithLearning[]): CoreFlashcard[] {
  const now = Date.now();
  return generateCoreFlashcards(items)
    .filter(fc => {
      // Include new, learning, and weak items
      if (['new', 'learning', 'weak'].includes(fc.learningState)) return true;
      // Include if due
      if (fc.dueAt && fc.dueAt <= now) return true;
      return false;
    })
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get weak flashcards for targeted review
 */
export function getWeakCoreFlashcards(items: CoreItemWithLearning[]): CoreFlashcard[] {
  return generateCoreFlashcards(items)
    .filter(fc => fc.learningState === 'weak')
    .sort((a, b) => b.priority - a.priority);
}

/**
 * Get flashcard count statistics
 */
export function getCoreFlashcardStats(items: CoreItemWithLearning[]) {
  const cards = generateCoreFlashcards(items);
  const now = Date.now();

  return {
    total: cards.length,
    new: cards.filter(c => c.learningState === 'new').length,
    learning: cards.filter(c => c.learningState === 'learning').length,
    review: cards.filter(c => c.learningState === 'review').length,
    weak: cards.filter(c => c.learningState === 'weak').length,
    mastered: cards.filter(c => c.learningState === 'mastered').length,
    due: cards.filter(c => c.dueAt && c.dueAt <= now).length,
  };
}
