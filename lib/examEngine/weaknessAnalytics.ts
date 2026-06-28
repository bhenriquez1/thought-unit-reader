// lib/examEngine/weaknessAnalytics.ts
// Adaptive weakness analytics over QuestionAttempt history — additive
// alongside lib/apex/apexScoringEngine.ts's existing pattern-readiness math
// (which stays as-is for the legacy 6-section pattern taxonomy). These
// functions work over the universal EngineQuestion/QuestionAttempt shapes
// so they apply to any future exam profile, not just DAT.

import type {
  ConfidenceAccuracyPoint,
  DifficultyAccuracy,
  ErrorTypeBreakdown,
  QuestionAttempt,
  TopicAccuracy,
  WeaknessReport,
} from "@/lib/examEngine/types";
import type { WeaknessAnalyticsConfig } from "@/lib/examEngine/types";

export function buildTopicAccuracy(attempts: QuestionAttempt[]): TopicAccuracy[] {
  const byTopic = new Map<string, { section: string; correct: number; total: number }>();
  for (const a of attempts) {
    const entry = byTopic.get(a.topic) ?? { section: a.section, correct: 0, total: 0 };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    byTopic.set(a.topic, entry);
  }
  return Array.from(byTopic.entries()).map(([topic, v]) => ({
    topic,
    section: v.section,
    correct: v.correct,
    total: v.total,
    percent: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
  }));
}

export function buildDifficultyAccuracy(attempts: QuestionAttempt[]): DifficultyAccuracy[] {
  const byDifficulty = new Map<string, { correct: number; total: number }>();
  for (const a of attempts) {
    const entry = byDifficulty.get(a.difficulty) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    byDifficulty.set(a.difficulty, entry);
  }
  return Array.from(byDifficulty.entries()).map(([difficulty, v]) => ({
    difficulty: difficulty as DifficultyAccuracy["difficulty"],
    correct: v.correct,
    total: v.total,
    percent: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
  }));
}

export function buildErrorTypeBreakdown(attempts: QuestionAttempt[]): ErrorTypeBreakdown[] {
  const misses = attempts.filter((a) => !a.correct);
  const byKey = new Map<string, { questionType: ErrorTypeBreakdown["questionType"]; trapType?: string; count: number }>();
  for (const a of misses) {
    const key = `${a.questionType}::${a.trapTriggered ?? ""}`;
    const entry = byKey.get(key) ?? { questionType: a.questionType, trapType: a.trapTriggered, count: 0 };
    entry.count += 1;
    byKey.set(key, entry);
  }
  return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
}

export function buildConfidenceAccuracy(attempts: QuestionAttempt[]): ConfidenceAccuracyPoint[] {
  const byConfidence = new Map<number, { correct: number; total: number }>();
  for (const a of attempts) {
    if (!a.confidence) continue;
    const entry = byConfidence.get(a.confidence) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    byConfidence.set(a.confidence, entry);
  }
  return Array.from(byConfidence.entries())
    .sort(([a], [b]) => a - b)
    .map(([confidence, v]) => ({
      confidence: confidence as ConfidenceAccuracyPoint["confidence"],
      accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
      count: v.total,
    }));
}

/** Diffs accuracy across exam sittings, grouped by examAttemptId — attempts
 *  without an examAttemptId are excluded since they can't be grouped into a
 *  sitting. */
export function buildImprovementOverTime(attempts: QuestionAttempt[]): WeaknessReport["improvementOverTime"] {
  const bySitting = new Map<string, { correct: number; total: number; firstCreatedAt: string }>();
  for (const a of attempts) {
    if (!a.examAttemptId) continue;
    const entry = bySitting.get(a.examAttemptId) ?? { correct: 0, total: 0, firstCreatedAt: a.createdAt };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    if (a.createdAt < entry.firstCreatedAt) entry.firstCreatedAt = a.createdAt;
    bySitting.set(a.examAttemptId, entry);
  }
  return Array.from(bySitting.entries())
    .map(([sessionId, v]) => ({
      sessionId,
      date: v.firstCreatedAt,
      percent: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function buildWeaknessReport(
  bookId: string,
  examProfileId: string,
  attempts: QuestionAttempt[],
  config: WeaknessAnalyticsConfig,
): WeaknessReport {
  const topicAccuracy = buildTopicAccuracy(attempts);
  const eligible = topicAccuracy.filter((t) => t.total >= config.minAttemptsForSignal);

  const weakestTopics = [...eligible]
    .filter((t) => t.percent < config.weakAccuracyThreshold)
    .sort((a, b) => a.percent - b.percent);

  const strongestTopics = [...eligible]
    .filter((t) => t.percent >= config.strongAccuracyThreshold)
    .sort((a, b) => b.percent - a.percent);

  return {
    bookId,
    examProfileId,
    generatedAt: new Date().toISOString(),
    topicAccuracy,
    difficultyAccuracy: buildDifficultyAccuracy(attempts),
    errorTypeBreakdown: buildErrorTypeBreakdown(attempts),
    confidenceAccuracy: buildConfidenceAccuracy(attempts),
    improvementOverTime: buildImprovementOverTime(attempts),
    weakestTopics,
    strongestTopics,
  };
}
