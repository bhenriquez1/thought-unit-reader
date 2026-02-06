/**
 * ⚡ Autopilot - Daily Study System
 *
 * Generates a daily study queue based on:
 * - Due reviews
 * - Weak concepts
 * - Knowledge debt
 * - Exam relevance
 *
 * Structure: Warm-up → Debt Attack → Exam Mode → Fix Loop
 */

import type { CoreItemWithLearning, Trigger } from './types';
import { getDueItems, sortByPriority } from './learningEngine';
import {
  calculateKnowledgeDebt,
  calculateExamReadiness,
  type ExamConfig,
  type RecallAttempt,
} from './analytics';

// ============================================================================
// Types
// ============================================================================

export type SessionPhase = 'warmup' | 'debt-attack' | 'exam' | 'fix-loop' | 'complete';

export interface DailyQueueItem {
  item: CoreItemWithLearning;
  phase: SessionPhase;
  reason: string;
  priority: number;
}

export interface DailyQueue {
  items: DailyQueueItem[];
  phases: {
    warmup: DailyQueueItem[];
    debtAttack: DailyQueueItem[];
    exam: DailyQueueItem[];
    fixLoop: DailyQueueItem[];
  };
  stats: {
    totalItems: number;
    estimatedMinutes: number;
    dueCount: number;
    weakCount: number;
    newCount: number;
  };
  generatedAt: number;
}

export interface AutopilotSession {
  id: string;
  queue: DailyQueue;
  currentIndex: number;
  currentPhase: SessionPhase;
  startedAt: number;
  completedAt: number | null;
  results: SessionResult[];
  paused: boolean;
}

export interface SessionResult {
  itemId: string;
  phase: SessionPhase;
  grade: 'again' | 'hard' | 'good' | 'easy';
  responseTimeMs: number;
  timestamp: number;
}

export interface AutopilotConfig {
  /** Target daily study time (minutes) */
  targetMinutes: number;
  /** Warmup items count */
  warmupCount: number;
  /** Debt attack items count */
  debtAttackCount: number;
  /** Exam mode items count */
  examCount: number;
  /** Fix loop max iterations */
  maxFixIterations: number;
  /** Exam configuration */
  examConfig?: Partial<ExamConfig>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: AutopilotConfig = {
  targetMinutes: 30,
  warmupCount: 3,
  debtAttackCount: 5,
  examCount: 10,
  maxFixIterations: 3,
};

const MINUTES_PER_ITEM = 2;

// ============================================================================
// Queue Generation
// ============================================================================

/**
 * Generate the daily study queue
 */
export function generateDailyQueue(
  items: CoreItemWithLearning[],
  recallHistory: RecallAttempt[] = [],
  config: Partial<AutopilotConfig> = {}
): DailyQueue {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();

  // Calculate analytics
  const debt = calculateKnowledgeDebt(items, recallHistory);
  const readiness = calculateExamReadiness(items, config.examConfig);

  // Get due items
  const dueItems = getDueItems(items);
  const sortedDue = sortByPriority(dueItems);

  // Get weak items
  const weakItems = items.filter((i) => i.learning.state === 'weak');

  // Get new items
  const newItems = items.filter((i) => i.learning.state === 'new');

  // Get high-debt items
  const highDebtItems = debt.highDebtItems
    .map((d) => items.find((i) => i.id === d.id))
    .filter(Boolean) as CoreItemWithLearning[];

  // Build phases
  const phases = {
    warmup: [] as DailyQueueItem[],
    debtAttack: [] as DailyQueueItem[],
    exam: [] as DailyQueueItem[],
    fixLoop: [] as DailyQueueItem[],
  };

  const usedIds = new Set<string>();

  // Phase 1: Warmup - Easy mastered items to build confidence
  const masteredItems = items.filter((i) => i.learning.state === 'mastered');
  for (let i = 0; i < Math.min(cfg.warmupCount, masteredItems.length); i++) {
    const item = masteredItems[i];
    if (!usedIds.has(item.id)) {
      phases.warmup.push({
        item,
        phase: 'warmup',
        reason: 'Confidence builder',
        priority: 1,
      });
      usedIds.add(item.id);
    }
  }

  // Phase 2: Debt Attack - High debt items first
  for (const item of highDebtItems.slice(0, cfg.debtAttackCount)) {
    if (!usedIds.has(item.id)) {
      phases.debtAttack.push({
        item,
        phase: 'debt-attack',
        reason: `High debt: ${debt.highDebtItems.find((d) => d.id === item.id)?.reason || 'Priority'}`,
        priority: 2,
      });
      usedIds.add(item.id);
    }
  }

  // Add weak items to debt attack
  for (const item of weakItems) {
    if (!usedIds.has(item.id) && phases.debtAttack.length < cfg.debtAttackCount) {
      phases.debtAttack.push({
        item,
        phase: 'debt-attack',
        reason: 'Weak item',
        priority: 3,
      });
      usedIds.add(item.id);
    }
  }

  // Phase 3: Exam Mode - Due items and exam-relevant
  for (const item of sortedDue.slice(0, cfg.examCount)) {
    if (!usedIds.has(item.id)) {
      phases.exam.push({
        item,
        phase: 'exam',
        reason: 'Due for review',
        priority: 4,
      });
      usedIds.add(item.id);
    }
  }

  // Add new items to exam mode
  for (const item of newItems) {
    if (!usedIds.has(item.id) && phases.exam.length < cfg.examCount) {
      phases.exam.push({
        item,
        phase: 'exam',
        reason: 'New concept',
        priority: 5,
      });
      usedIds.add(item.id);
    }
  }

  // Phase 4: Fix Loop - Items that were failed today (populated during session)
  // This phase is dynamic and items are added when user answers "again"

  // Combine all items
  const allItems = [
    ...phases.warmup,
    ...phases.debtAttack,
    ...phases.exam,
    ...phases.fixLoop,
  ];

  return {
    items: allItems,
    phases,
    stats: {
      totalItems: allItems.length,
      estimatedMinutes: allItems.length * MINUTES_PER_ITEM,
      dueCount: dueItems.length,
      weakCount: weakItems.length,
      newCount: newItems.length,
    },
    generatedAt: now,
  };
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Start a new autopilot session
 */
export function startSession(queue: DailyQueue): AutopilotSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    queue,
    currentIndex: 0,
    currentPhase: queue.items[0]?.phase || 'complete',
    startedAt: Date.now(),
    completedAt: null,
    results: [],
    paused: false,
  };
}

/**
 * Get the current item to review
 */
export function getCurrentItem(session: AutopilotSession): DailyQueueItem | null {
  if (session.currentIndex >= session.queue.items.length) {
    return null;
  }
  return session.queue.items[session.currentIndex];
}

/**
 * Record a review result and advance
 */
export function recordResult(
  session: AutopilotSession,
  grade: 'again' | 'hard' | 'good' | 'easy',
  responseTimeMs: number
): AutopilotSession {
  const currentItem = getCurrentItem(session);
  if (!currentItem) return session;

  const result: SessionResult = {
    itemId: currentItem.item.id,
    phase: currentItem.phase,
    grade,
    responseTimeMs,
    timestamp: Date.now(),
  };

  // Add to fix loop if failed
  let updatedQueue = session.queue;
  if (grade === 'again' && session.queue.phases.fixLoop.length < DEFAULT_CONFIG.maxFixIterations) {
    updatedQueue = {
      ...session.queue,
      items: [
        ...session.queue.items,
        {
          item: currentItem.item,
          phase: 'fix-loop' as SessionPhase,
          reason: 'Failed - needs review',
          priority: 10,
        },
      ],
      phases: {
        ...session.queue.phases,
        fixLoop: [
          ...session.queue.phases.fixLoop,
          {
            item: currentItem.item,
            phase: 'fix-loop' as SessionPhase,
            reason: 'Failed - needs review',
            priority: 10,
          },
        ],
      },
    };
  }

  const nextIndex = session.currentIndex + 1;
  const nextItem = updatedQueue.items[nextIndex];

  return {
    ...session,
    queue: updatedQueue,
    currentIndex: nextIndex,
    currentPhase: nextItem?.phase || 'complete',
    results: [...session.results, result],
    completedAt: nextIndex >= updatedQueue.items.length ? Date.now() : null,
  };
}

/**
 * Get session progress
 */
export function getProgress(session: AutopilotSession): {
  completed: number;
  total: number;
  percentage: number;
  currentPhase: SessionPhase;
  phaseProgress: Record<SessionPhase, { done: number; total: number }>;
} {
  const completed = session.currentIndex;
  const total = session.queue.items.length;

  const phaseProgress: Record<SessionPhase, { done: number; total: number }> = {
    warmup: { done: 0, total: session.queue.phases.warmup.length },
    'debt-attack': { done: 0, total: session.queue.phases.debtAttack.length },
    exam: { done: 0, total: session.queue.phases.exam.length },
    'fix-loop': { done: 0, total: session.queue.phases.fixLoop.length },
    complete: { done: 0, total: 0 },
  };

  for (const result of session.results) {
    if (phaseProgress[result.phase]) {
      phaseProgress[result.phase].done++;
    }
  }

  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    currentPhase: session.currentPhase,
    phaseProgress,
  };
}

/**
 * Get session statistics
 */
export function getSessionStats(session: AutopilotSession): {
  totalTime: number;
  averageResponseTime: number;
  accuracy: number;
  byGrade: Record<string, number>;
  byPhase: Record<SessionPhase, { correct: number; total: number }>;
} {
  const totalTime = (session.completedAt || Date.now()) - session.startedAt;
  const avgResponseTime =
    session.results.length > 0
      ? session.results.reduce((sum, r) => sum + r.responseTimeMs, 0) / session.results.length
      : 0;

  const byGrade: Record<string, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  const byPhase: Record<SessionPhase, { correct: number; total: number }> = {
    warmup: { correct: 0, total: 0 },
    'debt-attack': { correct: 0, total: 0 },
    exam: { correct: 0, total: 0 },
    'fix-loop': { correct: 0, total: 0 },
    complete: { correct: 0, total: 0 },
  };

  for (const result of session.results) {
    byGrade[result.grade]++;
    byPhase[result.phase].total++;
    if (result.grade !== 'again') {
      byPhase[result.phase].correct++;
    }
  }

  const totalAnswered = session.results.length;
  const totalCorrect = totalAnswered - byGrade.again;

  return {
    totalTime,
    averageResponseTime: avgResponseTime,
    accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    byGrade,
    byPhase,
  };
}

// ============================================================================
// Today Panel Helpers
// ============================================================================

/**
 * Get "What to study today" summary
 */
export function getTodaySummary(
  items: CoreItemWithLearning[],
  recallHistory: RecallAttempt[] = [],
  config: Partial<AutopilotConfig> = {}
): {
  recommendation: string;
  focusAreas: Trigger[];
  estimatedMinutes: number;
  urgentCount: number;
  queue: DailyQueue;
} {
  const queue = generateDailyQueue(items, recallHistory, config);
  const debt = calculateKnowledgeDebt(items, recallHistory);

  // Determine focus areas
  const triggerDebts = Object.entries(debt.byTrigger)
    .filter(([_, value]) => value > 30)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([trigger]) => trigger as Trigger);

  // Generate recommendation
  let recommendation: string;
  if (queue.stats.weakCount > 5) {
    recommendation = `Focus on ${queue.stats.weakCount} weak concepts today`;
  } else if (queue.stats.dueCount > 10) {
    recommendation = `${queue.stats.dueCount} items due - catch up on reviews`;
  } else if (queue.stats.newCount > 5) {
    recommendation = `Learn ${Math.min(5, queue.stats.newCount)} new concepts`;
  } else {
    recommendation = 'Maintain your knowledge with quick review';
  }

  return {
    recommendation,
    focusAreas: triggerDebts,
    estimatedMinutes: queue.stats.estimatedMinutes,
    urgentCount: debt.urgentItems.length,
    queue,
  };
}
