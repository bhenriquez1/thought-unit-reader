/**
 * ⚡ Core Learning Engine
 *
 * Spaced repetition system for Core items:
 * - SM-2 algorithm with modifications
 * - Combined model + learner confidence
 * - State transitions: new → learning → review → mastered/weak
 * - Auto-generated flashcards from Core sentences
 */

import type { CoreItem, CoreItemWithLearning, LearningState } from './types';

// ============================================================================
// Constants
// ============================================================================

export const LEARNING_CONFIG = {
  // Initial intervals (in days)
  INITIAL_INTERVAL: 1,
  LEARNING_STEPS: [1, 3], // Minutes between learning steps

  // SM-2 parameters
  INITIAL_EASE_FACTOR: 2.5,
  MIN_EASE_FACTOR: 1.3,
  EASE_BONUS: 0.15,
  EASE_PENALTY: 0.2,

  // Confidence weights
  MODEL_CONFIDENCE_WEIGHT: 0.3,
  LEARNER_CONFIDENCE_WEIGHT: 0.7,

  // State thresholds
  MASTERY_THRESHOLD: 0.85, // Combined confidence for mastery
  WEAK_THRESHOLD: 0.4,     // Below this = weak
  REVIEW_COUNT_FOR_MASTERY: 3, // Minimum reviews before mastery

  // Scheduling
  MAX_INTERVAL_DAYS: 365,
  FUZZ_FACTOR: 0.05, // Add randomness to prevent clustering
} as const;

// ============================================================================
// Types
// ============================================================================

export type ReviewGrade = 'again' | 'hard' | 'easy';

export interface ReviewResult {
  item: CoreItemWithLearning;
  previousState: LearningState;
  newState: LearningState;
  nextReviewAt: number;
  intervalDays: number;
}

// ============================================================================
// State Management
// ============================================================================

/**
 * Initialize learning data for a new Core item
 */
export function initializeLearning(item: CoreItem): CoreItemWithLearning {
  // Calculate model confidence based on extraction data
  const modelConfidence = calculateModelConfidence(item);

  return {
    ...item,
    learning: {
      state: 'new',
      modelConfidence,
      learnerConfidence: 0.5, // Start neutral
      combinedConfidence: modelConfidence * LEARNING_CONFIG.MODEL_CONFIDENCE_WEIGHT + 0.5 * LEARNING_CONFIG.LEARNER_CONFIDENCE_WEIGHT,
      nextReviewAt: null,
      reviewCount: 0,
      correctCount: 0,
      lastReviewAt: null,
      intervalDays: 0,
      easeFactor: LEARNING_CONFIG.INITIAL_EASE_FACTOR,
    },
    flashcard: generateFlashcard(item),
  };
}

/**
 * Calculate model confidence from extraction metadata
 */
function calculateModelConfidence(item: CoreItem): number {
  let confidence = item.confidence;

  // Boost for multiple triggers (more structured content)
  if (item.triggers.length > 1) {
    confidence += 0.05 * (item.triggers.length - 1);
  }

  // Boost for exceptions (shows nuanced understanding)
  if (item.exceptions.length > 0) {
    confidence += 0.1;
  }

  // Penalty for very short sentences (might be incomplete)
  if (item.core_sentence.length < 40) {
    confidence -= 0.1;
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Generate flashcard from Core item
 */
function generateFlashcard(item: CoreItem): CoreItemWithLearning['flashcard'] {
  // Determine flashcard type based on triggers
  let type: 'definition' | 'decision' | 'mechanism' | 'contrast' = 'definition';

  if (item.triggers.includes('A')) type = 'decision';
  else if (item.triggers.includes('C')) type = 'mechanism';
  else if (item.triggers.includes('B')) type = 'contrast';
  else if (item.triggers.includes('D')) type = 'definition';

  // Generate front/back based on type
  const sentence = item.core_sentence;
  let front = '';
  let back = sentence;

  switch (type) {
    case 'definition': {
      // Try to split on "is", "are", "means"
      const match = sentence.match(/^(.+?)\s+(is|are|means|refers to)\s+(.+)$/i);
      if (match) {
        front = `What ${match[2]} ${match[1]}?`;
        back = match[3];
      } else {
        front = `Explain: ${sentence.slice(0, 50)}...`;
      }
      break;
    }
    case 'decision': {
      // IF-THEN format
      const match = sentence.match(/^if\s+(.+?),?\s+then\s+(.+)$/i);
      if (match) {
        front = `When ${match[1]}, what happens?`;
        back = match[2];
      } else {
        front = `What is the rule for: ${sentence.slice(0, 40)}...?`;
      }
      break;
    }
    case 'mechanism': {
      // BECAUSE format
      const match = sentence.match(/^(.+?)\s+because\s+(.+)$/i);
      if (match) {
        front = `Why: ${match[1]}?`;
        back = match[2];
      } else {
        front = `Explain the mechanism: ${sentence.slice(0, 40)}...`;
      }
      break;
    }
    case 'contrast': {
      front = `What is the exception/contrast?`;
      back = sentence;
      if (item.exceptions.length > 0) {
        back += '\n\nExceptions:\n' + item.exceptions.map(e => `• ${e.sentence}`).join('\n');
      }
      break;
    }
  }

  return { front, back, type };
}

// ============================================================================
// Review Processing
// ============================================================================

/**
 * Process a review and update learning state
 */
export function processReview(
  item: CoreItemWithLearning,
  grade: ReviewGrade
): ReviewResult {
  const previousState = item.learning.state;
  const now = Date.now();

  // Update review counts
  const reviewCount = item.learning.reviewCount + 1;
  const correctCount = grade !== 'again' ? item.learning.correctCount + 1 : item.learning.correctCount;

  // Calculate new ease factor
  let easeFactor = item.learning.easeFactor;
  switch (grade) {
    case 'easy':
      easeFactor += LEARNING_CONFIG.EASE_BONUS;
      break;
    case 'hard':
      easeFactor -= LEARNING_CONFIG.EASE_PENALTY / 2;
      break;
    case 'again':
      easeFactor -= LEARNING_CONFIG.EASE_PENALTY;
      break;
  }
  easeFactor = Math.max(LEARNING_CONFIG.MIN_EASE_FACTOR, easeFactor);

  // Calculate new interval
  let intervalDays = calculateNewInterval(item, grade, easeFactor);

  // Calculate learner confidence
  const learnerConfidence = reviewCount > 0 ? correctCount / reviewCount : 0.5;

  // Calculate combined confidence
  const combinedConfidence =
    item.learning.modelConfidence * LEARNING_CONFIG.MODEL_CONFIDENCE_WEIGHT +
    learnerConfidence * LEARNING_CONFIG.LEARNER_CONFIDENCE_WEIGHT;

  // Determine new state
  const newState = determineState(
    previousState,
    grade,
    combinedConfidence,
    reviewCount
  );

  // Calculate next review time
  const nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;

  // Create updated item
  const updatedItem: CoreItemWithLearning = {
    ...item,
    learning: {
      ...item.learning,
      state: newState,
      learnerConfidence,
      combinedConfidence,
      nextReviewAt,
      reviewCount,
      correctCount,
      lastReviewAt: now,
      intervalDays,
      easeFactor,
    },
  };

  return {
    item: updatedItem,
    previousState,
    newState,
    nextReviewAt,
    intervalDays,
  };
}

/**
 * Calculate new interval based on SM-2 algorithm
 */
function calculateNewInterval(
  item: CoreItemWithLearning,
  grade: ReviewGrade,
  easeFactor: number
): number {
  const currentInterval = item.learning.intervalDays || LEARNING_CONFIG.INITIAL_INTERVAL;

  if (grade === 'again') {
    // Reset to initial interval
    return LEARNING_CONFIG.INITIAL_INTERVAL;
  }

  let newInterval: number;

  if (item.learning.state === 'new' || item.learning.state === 'learning') {
    // Use fixed learning steps
    newInterval = LEARNING_CONFIG.INITIAL_INTERVAL;
  } else {
    // SM-2 interval calculation
    if (grade === 'hard') {
      newInterval = currentInterval * 1.2;
    } else {
      // easy
      newInterval = currentInterval * easeFactor;
    }
  }

  // Add fuzz to prevent clustering
  const fuzz = 1 + (Math.random() - 0.5) * 2 * LEARNING_CONFIG.FUZZ_FACTOR;
  newInterval *= fuzz;

  // Clamp to max
  return Math.min(Math.round(newInterval * 10) / 10, LEARNING_CONFIG.MAX_INTERVAL_DAYS);
}

/**
 * Determine new learning state
 */
function determineState(
  currentState: LearningState,
  grade: ReviewGrade,
  combinedConfidence: number,
  reviewCount: number
): LearningState {
  // Failed review → weak or learning
  if (grade === 'again') {
    if (currentState === 'mastered' || currentState === 'review') {
      return 'weak';
    }
    return 'learning';
  }

  // Check for mastery
  if (
    combinedConfidence >= LEARNING_CONFIG.MASTERY_THRESHOLD &&
    reviewCount >= LEARNING_CONFIG.REVIEW_COUNT_FOR_MASTERY
  ) {
    return 'mastered';
  }

  // Check for weak
  if (combinedConfidence < LEARNING_CONFIG.WEAK_THRESHOLD) {
    return 'weak';
  }

  // Transitions based on current state
  switch (currentState) {
    case 'new':
      return 'learning';
    case 'learning':
      return grade === 'easy' ? 'review' : 'learning';
    case 'weak':
      return 'learning';
    default:
      return 'review';
  }
}

// ============================================================================
// Queue Management
// ============================================================================

/**
 * Get items due for review
 */
export function getDueItems(
  items: CoreItemWithLearning[],
  now: number = Date.now()
): CoreItemWithLearning[] {
  return items.filter((item) => {
    // New items are always due
    if (item.learning.state === 'new') return true;

    // Check if review is due
    if (item.learning.nextReviewAt && item.learning.nextReviewAt <= now) {
      return true;
    }

    return false;
  });
}

/**
 * Sort items by priority for study session
 */
export function sortByPriority(items: CoreItemWithLearning[]): CoreItemWithLearning[] {
  return [...items].sort((a, b) => {
    // Priority order: weak > due > learning > new > review > mastered
    const stateOrder: Record<LearningState, number> = {
      weak: 0,
      learning: 1,
      new: 2,
      review: 3,
      mastered: 4,
    };

    const stateCompare = stateOrder[a.learning.state] - stateOrder[b.learning.state];
    if (stateCompare !== 0) return stateCompare;

    // Within same state, sort by due date (earlier first)
    const aDue = a.learning.nextReviewAt || Infinity;
    const bDue = b.learning.nextReviewAt || Infinity;
    return aDue - bDue;
  });
}

/**
 * Get study session statistics
 */
export function getStudyStats(items: CoreItemWithLearning[]): {
  total: number;
  byState: Record<LearningState, number>;
  dueCount: number;
  averageConfidence: number;
} {
  const byState: Record<LearningState, number> = {
    new: 0,
    learning: 0,
    review: 0,
    weak: 0,
    mastered: 0,
  };

  let totalConfidence = 0;
  let dueCount = 0;
  const now = Date.now();

  for (const item of items) {
    byState[item.learning.state]++;
    totalConfidence += item.learning.combinedConfidence;

    if (
      item.learning.state === 'new' ||
      (item.learning.nextReviewAt && item.learning.nextReviewAt <= now)
    ) {
      dueCount++;
    }
  }

  return {
    total: items.length,
    byState,
    dueCount,
    averageConfidence: items.length > 0 ? totalConfidence / items.length : 0,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Initialize learning for multiple Core items
 */
export function initializeBatch(items: CoreItem[]): CoreItemWithLearning[] {
  return items.map(initializeLearning);
}

/**
 * Get next review item from queue
 */
export function getNextReviewItem(
  items: CoreItemWithLearning[]
): CoreItemWithLearning | null {
  const due = getDueItems(items);
  const sorted = sortByPriority(due);
  return sorted[0] || null;
}
