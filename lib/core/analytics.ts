/**
 * ⚡ Core Analytics Engine
 *
 * Knowledge Debt, Exam Readiness, and Time-to-Exam Forecasting
 */

import type { CoreItemWithLearning, LearningState, Trigger } from './types';
import { LEARNING_CONFIG } from './learningEngine';

// ============================================================================
// Types
// ============================================================================

export interface KnowledgeDebt {
  /** Total debt score (0-100, higher = more work needed) */
  total: number;
  /** Debt by trigger type */
  byTrigger: Record<Trigger, number>;
  /** Debt by chapter */
  byChapter: Record<string, number>;
  /** Most urgent items to review */
  urgentItems: string[];
  /** Items contributing most to debt */
  highDebtItems: Array<{ id: string; debt: number; reason: string }>;
}

export interface ExamReadiness {
  /** Overall readiness percentage (0-100) */
  overall: number;
  /** Readiness by category */
  byCategory: {
    definitions: number;
    decisions: number;
    mechanisms: number;
    contrasts: number;
  };
  /** Confidence interval */
  confidenceRange: [number, number];
  /** Weak areas that need attention */
  weakAreas: Array<{ trigger: Trigger; readiness: number; count: number }>;
  /** Strong areas */
  strongAreas: Array<{ trigger: Trigger; readiness: number; count: number }>;
}

export interface TimeToExamForecast {
  /** Estimated days until exam-ready at current pace */
  daysToReady: number;
  /** Required daily study time (minutes) to meet deadline */
  requiredDailyMinutes: number;
  /** Pass probability if exam were today */
  currentPassProbability: number;
  /** Projected pass probability on exam date */
  projectedPassProbability: number;
  /** Items that need review before exam */
  itemsNeedingReview: number;
  /** Recommended study plan */
  studyPlan: StudyPlanItem[];
  /** Risk factors */
  risks: string[];
}

export interface StudyPlanItem {
  date: string;
  itemsToReview: number;
  focusAreas: Trigger[];
  estimatedMinutes: number;
}

export interface ExamConfig {
  /** Days until exam */
  daysUntilExam: number;
  /** Target pass score (0-100) */
  targetScore: number;
  /** Weighted triggers for exam focus */
  triggerWeights: Partial<Record<Trigger, number>>;
  /** Available study time per day (minutes) */
  dailyStudyMinutes: number;
}

export interface RecallAttempt {
  itemId: string;
  timestamp: number;
  correct: boolean;
  responseTimeMs: number;
  confidenceBefore: number;
  confidenceAfter: number;
}

// ============================================================================
// Constants
// ============================================================================

const DECAY_RATE = 0.1; // Daily decay rate for unreviewed items
const REVIEW_EFFECTIVENESS = 0.15; // Confidence gain per correct review
const MIN_PASS_PROBABILITY = 0.6; // Minimum pass probability threshold
const AVERAGE_REVIEW_TIME_MINUTES = 2; // Average time per item review

// Default trigger weights for exam focus
const DEFAULT_TRIGGER_WEIGHTS: Record<Trigger, number> = {
  A: 1.5, // Conditionals are high-yield
  B: 1.3, // Contrasts are common exam questions
  C: 1.2, // Causation
  D: 1.0, // Definitions
  E: 1.1, // Enumeration
  F: 1.4, // Formulas
  G: 0.9, // Gradation
  H: 1.0, // Hierarchy
};

// ============================================================================
// Knowledge Debt Calculation
// ============================================================================

/**
 * Calculate knowledge debt for a set of learning items
 */
export function calculateKnowledgeDebt(
  items: CoreItemWithLearning[],
  recallHistory: RecallAttempt[] = []
): KnowledgeDebt {
  if (items.length === 0) {
    return {
      total: 0,
      byTrigger: { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0 },
      byChapter: {},
      urgentItems: [],
      highDebtItems: [],
    };
  }

  const now = Date.now();
  const debtByTrigger: Record<Trigger, { total: number; count: number }> = {
    A: { total: 0, count: 0 },
    B: { total: 0, count: 0 },
    C: { total: 0, count: 0 },
    D: { total: 0, count: 0 },
    E: { total: 0, count: 0 },
    F: { total: 0, count: 0 },
    G: { total: 0, count: 0 },
    H: { total: 0, count: 0 },
  };
  const debtByChapter: Record<string, { total: number; count: number }> = {};
  const itemDebts: Array<{ id: string; debt: number; reason: string }> = [];
  const urgentItems: string[] = [];

  for (const item of items) {
    const itemDebt = calculateItemDebt(item, now, recallHistory);

    // Track by trigger
    for (const trigger of item.triggers) {
      debtByTrigger[trigger].total += itemDebt.debt;
      debtByTrigger[trigger].count++;
    }

    // Track by chapter (use source page as proxy)
    const chapter = `Chapter ${Math.ceil((item.source.page || 1) / 20)}`;
    if (!debtByChapter[chapter]) {
      debtByChapter[chapter] = { total: 0, count: 0 };
    }
    debtByChapter[chapter].total += itemDebt.debt;
    debtByChapter[chapter].count++;

    // Track high-debt items
    if (itemDebt.debt > 50) {
      itemDebts.push({ id: item.id, debt: itemDebt.debt, reason: itemDebt.reason });
    }

    // Track urgent items
    if (itemDebt.urgent) {
      urgentItems.push(item.id);
    }
  }

  // Calculate total debt (normalized 0-100)
  const totalDebt = items.reduce((sum, item) => {
    return sum + calculateItemDebt(item, now, recallHistory).debt;
  }, 0) / items.length;

  // Normalize trigger debts
  const normalizedByTrigger = Object.fromEntries(
    Object.entries(debtByTrigger).map(([trigger, data]) => [
      trigger,
      data.count > 0 ? data.total / data.count : 0,
    ])
  ) as Record<Trigger, number>;

  // Normalize chapter debts
  const normalizedByChapter = Object.fromEntries(
    Object.entries(debtByChapter).map(([chapter, data]) => [
      chapter,
      data.count > 0 ? data.total / data.count : 0,
    ])
  );

  return {
    total: Math.min(100, Math.max(0, totalDebt)),
    byTrigger: normalizedByTrigger,
    byChapter: normalizedByChapter,
    urgentItems: urgentItems.slice(0, 10),
    highDebtItems: itemDebts.sort((a, b) => b.debt - a.debt).slice(0, 10),
  };
}

function calculateItemDebt(
  item: CoreItemWithLearning,
  now: number,
  recallHistory: RecallAttempt[]
): { debt: number; urgent: boolean; reason: string } {
  const { learning } = item;
  let debt = 0;
  let reason = '';

  // Base debt from learning state
  switch (learning.state) {
    case 'new':
      debt = 80;
      reason = 'Not yet learned';
      break;
    case 'learning':
      debt = 60;
      reason = 'Still learning';
      break;
    case 'weak':
      debt = 90;
      reason = 'Marked as weak';
      break;
    case 'review':
      debt = 30;
      reason = 'Due for review';
      break;
    case 'mastered':
      debt = 10;
      reason = 'Mastered';
      break;
  }

  // Adjust for confidence
  debt *= (1 - learning.combinedConfidence);

  // Adjust for overdue reviews
  if (learning.nextReviewAt && learning.nextReviewAt < now) {
    const overdueDays = (now - learning.nextReviewAt) / (24 * 60 * 60 * 1000);
    debt += Math.min(30, overdueDays * 5);
    if (!reason.includes('overdue')) {
      reason = `Overdue by ${Math.floor(overdueDays)} days`;
    }
  }

  // Adjust for recent failures
  const recentFailures = recallHistory.filter(
    (r) => r.itemId === item.id && !r.correct && now - r.timestamp < 7 * 24 * 60 * 60 * 1000
  ).length;
  if (recentFailures > 0) {
    debt += recentFailures * 10;
    reason = `${recentFailures} recent failures`;
  }

  const urgent = debt > 70 || (learning.state === 'weak' && debt > 50);

  return { debt: Math.min(100, Math.max(0, debt)), urgent, reason };
}

// ============================================================================
// Exam Readiness Calculation
// ============================================================================

/**
 * Calculate exam readiness percentage
 */
export function calculateExamReadiness(
  items: CoreItemWithLearning[],
  config: Partial<ExamConfig> = {}
): ExamReadiness {
  if (items.length === 0) {
    return {
      overall: 0,
      byCategory: { definitions: 0, decisions: 0, mechanisms: 0, contrasts: 0 },
      confidenceRange: [0, 0],
      weakAreas: [],
      strongAreas: [],
    };
  }

  const triggerWeights = { ...DEFAULT_TRIGGER_WEIGHTS, ...config.triggerWeights };

  // Group items by category
  const categories = {
    definitions: items.filter((i) => i.triggers.includes('D')),
    decisions: items.filter((i) => i.triggers.includes('A')),
    mechanisms: items.filter((i) => i.triggers.includes('C')),
    contrasts: items.filter((i) => i.triggers.includes('B')),
  };

  // Calculate readiness per category
  const byCategory = {
    definitions: calculateCategoryReadiness(categories.definitions),
    decisions: calculateCategoryReadiness(categories.decisions),
    mechanisms: calculateCategoryReadiness(categories.mechanisms),
    contrasts: calculateCategoryReadiness(categories.contrasts),
  };

  // Calculate weighted overall readiness
  let totalWeight = 0;
  let weightedSum = 0;

  for (const item of items) {
    const itemWeight = item.triggers.reduce((sum, t) => sum + (triggerWeights[t] || 1), 0);
    totalWeight += itemWeight;
    weightedSum += item.learning.combinedConfidence * 100 * itemWeight;
  }

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate confidence interval
  const confidences = items.map((i) => i.learning.combinedConfidence * 100);
  const stdDev = calculateStdDev(confidences);
  const confidenceRange: [number, number] = [
    Math.max(0, overall - stdDev),
    Math.min(100, overall + stdDev),
  ];

  // Identify weak and strong areas by trigger
  const triggerReadiness: Array<{ trigger: Trigger; readiness: number; count: number }> = [];

  for (const trigger of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as Trigger[]) {
    const triggerItems = items.filter((i) => i.triggers.includes(trigger));
    if (triggerItems.length > 0) {
      const readiness = calculateCategoryReadiness(triggerItems);
      triggerReadiness.push({ trigger, readiness, count: triggerItems.length });
    }
  }

  const sorted = triggerReadiness.sort((a, b) => a.readiness - b.readiness);
  const weakAreas = sorted.filter((t) => t.readiness < 60).slice(0, 3);
  const strongAreas = sorted.filter((t) => t.readiness >= 80).slice(-3).reverse();

  return {
    overall: Math.round(overall),
    byCategory,
    confidenceRange: [Math.round(confidenceRange[0]), Math.round(confidenceRange[1])],
    weakAreas,
    strongAreas,
  };
}

function calculateCategoryReadiness(items: CoreItemWithLearning[]): number {
  if (items.length === 0) return 0;

  const total = items.reduce((sum, item) => {
    let readiness = item.learning.combinedConfidence * 100;

    // Bonus for mastered state
    if (item.learning.state === 'mastered') readiness = Math.min(100, readiness + 10);

    // Penalty for weak state
    if (item.learning.state === 'weak') readiness = Math.max(0, readiness - 20);

    return sum + readiness;
  }, 0);

  return Math.round(total / items.length);
}

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// ============================================================================
// Time-to-Exam Forecasting
// ============================================================================

/**
 * Calculate time-to-exam forecast with pass probability
 */
export function calculateTimeToExam(
  items: CoreItemWithLearning[],
  config: ExamConfig,
  studyHistory: { date: string; minutesStudied: number }[] = []
): TimeToExamForecast {
  if (items.length === 0) {
    return {
      daysToReady: 0,
      requiredDailyMinutes: 0,
      currentPassProbability: 0,
      projectedPassProbability: 0,
      itemsNeedingReview: 0,
      studyPlan: [],
      risks: ['No items to study'],
    };
  }

  const now = Date.now();
  const examDate = now + config.daysUntilExam * 24 * 60 * 60 * 1000;
  const triggerWeights = { ...DEFAULT_TRIGGER_WEIGHTS, ...config.triggerWeights };

  // Calculate current pass probability
  const currentReadiness = calculateExamReadiness(items, config);
  const currentPassProbability = calculatePassProbability(
    currentReadiness.overall,
    config.targetScore
  );

  // Count items needing review
  const itemsNeedingReview = items.filter(
    (i) => i.learning.state !== 'mastered' || i.learning.combinedConfidence < 0.85
  ).length;

  // Calculate average study pace
  const recentStudy = studyHistory.slice(-7);
  const avgDailyMinutes = recentStudy.length > 0
    ? recentStudy.reduce((sum, s) => sum + s.minutesStudied, 0) / recentStudy.length
    : config.dailyStudyMinutes;

  // Estimate time to ready
  const totalReviewTimeNeeded = itemsNeedingReview * AVERAGE_REVIEW_TIME_MINUTES;
  const daysToReady = avgDailyMinutes > 0
    ? Math.ceil(totalReviewTimeNeeded / avgDailyMinutes)
    : config.daysUntilExam;

  // Calculate required daily study time
  const requiredDailyMinutes = config.daysUntilExam > 0
    ? Math.ceil(totalReviewTimeNeeded / config.daysUntilExam)
    : totalReviewTimeNeeded;

  // Project pass probability on exam date
  const projectedConfidence = projectConfidence(
    items,
    config.daysUntilExam,
    avgDailyMinutes
  );
  const projectedPassProbability = calculatePassProbability(
    projectedConfidence,
    config.targetScore
  );

  // Generate study plan
  const studyPlan = generateStudyPlan(items, config, triggerWeights);

  // Identify risks
  const risks: string[] = [];
  if (requiredDailyMinutes > config.dailyStudyMinutes * 1.5) {
    risks.push('Study pace may be insufficient');
  }
  if (currentPassProbability < MIN_PASS_PROBABILITY) {
    risks.push('Current knowledge level is below passing threshold');
  }
  if (items.filter((i) => i.learning.state === 'weak').length > items.length * 0.2) {
    risks.push('High percentage of weak items');
  }
  if (daysToReady > config.daysUntilExam) {
    risks.push('May not be ready by exam date at current pace');
  }

  return {
    daysToReady,
    requiredDailyMinutes,
    currentPassProbability,
    projectedPassProbability,
    itemsNeedingReview,
    studyPlan,
    risks,
  };
}

function calculatePassProbability(readiness: number, targetScore: number): number {
  // Sigmoid function centered on target score
  const x = (readiness - targetScore) / 20;
  return Math.round(100 / (1 + Math.exp(-x)));
}

function projectConfidence(
  items: CoreItemWithLearning[],
  daysUntilExam: number,
  avgDailyMinutes: number
): number {
  // Estimate reviews possible
  const reviewsPerDay = avgDailyMinutes / AVERAGE_REVIEW_TIME_MINUTES;
  const totalReviews = reviewsPerDay * daysUntilExam;

  // Calculate projected average confidence
  let projectedTotal = 0;

  for (const item of items) {
    let confidence = item.learning.combinedConfidence;

    // Apply decay
    confidence *= Math.pow(1 - DECAY_RATE, daysUntilExam / 7);

    // Apply estimated review gains (simplified)
    const estimatedReviews = Math.min(3, totalReviews / items.length);
    confidence += estimatedReviews * REVIEW_EFFECTIVENESS * (1 - confidence);

    projectedTotal += Math.min(1, confidence);
  }

  return (projectedTotal / items.length) * 100;
}

function generateStudyPlan(
  items: CoreItemWithLearning[],
  config: ExamConfig,
  triggerWeights: Record<Trigger, number>
): StudyPlanItem[] {
  const plan: StudyPlanItem[] = [];
  const now = new Date();

  // Sort items by priority
  const sortedItems = [...items].sort((a, b) => {
    const aWeight = a.triggers.reduce((sum, t) => sum + (triggerWeights[t] || 1), 0);
    const bWeight = b.triggers.reduce((sum, t) => sum + (triggerWeights[t] || 1), 0);
    const aPriority = (1 - a.learning.combinedConfidence) * aWeight;
    const bPriority = (1 - b.learning.combinedConfidence) * bWeight;
    return bPriority - aPriority;
  });

  // Distribute items across days
  const itemsPerDay = Math.ceil(sortedItems.length / config.daysUntilExam);
  let itemIndex = 0;

  for (let day = 0; day < Math.min(config.daysUntilExam, 14); day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);

    const dayItems = sortedItems.slice(itemIndex, itemIndex + itemsPerDay);
    itemIndex += itemsPerDay;

    if (dayItems.length === 0) break;

    const focusTriggers = new Set<Trigger>();
    for (const item of dayItems) {
      for (const trigger of item.triggers) {
        focusTriggers.add(trigger);
      }
    }

    plan.push({
      date: date.toISOString().split('T')[0],
      itemsToReview: dayItems.length,
      focusAreas: Array.from(focusTriggers).slice(0, 3),
      estimatedMinutes: dayItems.length * AVERAGE_REVIEW_TIME_MINUTES,
    });
  }

  return plan;
}

// ============================================================================
// Pass/Fail Probability
// ============================================================================

export interface PassFailMeter {
  probability: number;
  status: 'failing' | 'at-risk' | 'on-track' | 'ready';
  message: string;
  improvementNeeded: number;
}

/**
 * Calculate pass/fail probability meter
 */
export function calculatePassFailMeter(
  readiness: ExamReadiness,
  config: ExamConfig
): PassFailMeter {
  const probability = calculatePassProbability(readiness.overall, config.targetScore);
  const improvementNeeded = Math.max(0, config.targetScore - readiness.overall);

  let status: PassFailMeter['status'];
  let message: string;

  if (probability >= 80) {
    status = 'ready';
    message = 'You are ready for the exam!';
  } else if (probability >= 60) {
    status = 'on-track';
    message = 'On track, keep reviewing weak areas.';
  } else if (probability >= 40) {
    status = 'at-risk';
    message = 'At risk. Focus on high-debt concepts.';
  } else {
    status = 'failing';
    message = 'More study needed. Review all weak items.';
  }

  return { probability, status, message, improvementNeeded };
}
