// lib/knowledge/computeMastery.ts
// Pure mastery computation — no I/O, no side effects.

import type { KnowledgeNodeProgress } from "./knowledgeGraphSchema";

/** Composite 0–100 mastery score.  Recall + understanding dominate; memory
 *  strength and confidence act as multipliers. */
export function computeMastery(p: KnowledgeNodeProgress): number {
  const recall     = p.recallScore        ?? 0;
  const understand = p.understandingScore ?? 0;
  const memory     = p.memoryStrength     ?? 0;
  const confidence = p.confidenceScore    ?? 0;
  return Math.min(100, Math.round(
    recall      * 0.35 +
    understand  * 0.35 +
    memory      * 0.20 +
    confidence  * 0.10,
  ));
}

export type MasteryLevel = "novice" | "learning" | "developing" | "proficient" | "mastered";

export function masteryLevel(score: number): MasteryLevel {
  if (score >= 85) return "mastered";
  if (score >= 65) return "proficient";
  if (score >= 45) return "developing";
  if (score >= 20) return "learning";
  return "novice";
}

export const MASTERY_COLORS: Record<MasteryLevel, string> = {
  novice:     "#6b7280",
  learning:   "#f59e0b",
  developing: "#3b82f6",
  proficient: "#8b5cf6",
  mastered:   "#10b981",
};

/**
 * @deprecated Use applyLearningEvent(progress, { kind: "recall-graded", ... })
 * from lib/knowledge/learningStateEvents.ts instead — it covers the same
 * recallScore/memoryStrength math plus exposureCount, successfulRecallCount/
 * failedRecallCount, and an evidence-log entry, and (unlike this function)
 * takes its timestamp from the caller rather than calling `new Date()`
 * internally, which is what makes it deterministic/testable. Kept only for
 * any caller outside this codebase's Phase A migration; do not add new
 * call sites.
 */
export function recallDifficultyPatch(
  current: KnowledgeNodeProgress,
  difficulty: "easy" | "medium" | "hard",
  now: string = new Date().toISOString(),
): Partial<KnowledgeNodeProgress> {
  if (difficulty === "easy") {
    return {
      recallScore:    Math.min(100, (current.recallScore  ?? 0) + 10),
      memoryStrength: Math.min(100, (current.memoryStrength ?? 0) + 5),
      correctCount:   (current.correctCount ?? 0) + 1,
      lastReviewedAt: now,
    };
  }
  if (difficulty === "medium") {
    return {
      recallScore:    Math.min(100, (current.recallScore  ?? 0) + 5),
      memoryStrength: Math.min(100, (current.memoryStrength ?? 0) + 2),
      correctCount:   (current.correctCount ?? 0) + 1,
      lastReviewedAt: now,
    };
  }
  // hard
  return {
    recallScore:    Math.max(0, (current.recallScore  ?? 0) - 10),
    memoryStrength: Math.max(0, (current.memoryStrength ?? 0) - 8),
    missCount:      (current.missCount ?? 0) + 1,
    lastReviewedAt: now,
  };
}
