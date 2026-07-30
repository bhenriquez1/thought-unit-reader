// lib/learningHub/conceptLearningPlan.ts
// Zero-AI "What should I learn next?" engine for the Learning Hub.
//
// Converts canonical units + recall history → TodaysMission without an API
// call. The engine:
//
//   1. Identifies weak areas (recently missed) and units due for SRS recall
//   2. Surfaces highest-importance concepts the learner hasn't yet mastered
//   3. Produces a LearningAction sequence ordered by:
//        weak areas → due for recall → critical → high → medium → reference
//   4. Estimates session time (2 min read + 1 min recall per goal)
//
// TodaysMission feeds the Learning Hub overview "Today's Mission" panel.

import { resolveImportanceLevel, type ImportanceLevel } from "@/lib/reader/importanceBadge";

// ---------------------------------------------------------------------------
// Shared input types (re-exported for use by semanticToc + masteryBreakdown)
// ---------------------------------------------------------------------------

export interface ConceptUnit {
  id: string;
  text: string;
  title?: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
  pageNumber?: number;
}

/**
 * Lightweight recall snapshot — callers map their SRS state to this shape.
 * dueAt is a Unix-ms timestamp; 0 means never attempted.
 */
export interface RecallItem {
  unitId: string;
  dueAt: number;
  correct: boolean;
  streak: number;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ConceptGoal {
  id: string;
  label: string;
  canonicalType: string;
  importanceLevel: ImportanceLevel;
  completed: boolean;
  dueForRecall: boolean;
  weakArea: boolean;
  estimatedMinutes: number;
  pageNumber?: number;
}

export type LearningActionType = "read" | "recall" | "review" | "practice";

export interface LearningAction {
  type: LearningActionType;
  label: string;
  unitId: string;
  estimatedMinutes: number;
  pageNumber?: number;
}

export interface TodaysMission {
  bookTitle: string;
  estimatedMinutes: number;
  focusLevel: "critical" | "high" | "mixed";
  concepts: ConceptGoal[];
  /** Unit IDs answered incorrectly in the most recent recall session. */
  missedRecently: string[];
  recommendedSequence: LearningAction[];
}

export interface MissionOpts {
  bookTitle?: string;
  /** Unix-ms timestamp for "now" — used for SRS due-date comparison. */
  now?: number;
  /** Maximum concept goals in the mission. Default: 10 */
  maxGoals?: number;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  reference: 3,
};

const MINUTES_READ   = 2;
const MINUTES_RECALL = 1;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function goalLabel(unit: ConceptUnit): string {
  if (unit.title) return unit.title;
  const match = unit.text.match(/^([^.,;:!?\n]{4,60})/);
  return (match?.[1] ?? unit.text.slice(0, 60)).trim();
}

function actionLabel(type: LearningActionType, label: string): string {
  switch (type) {
    case "read":     return `Read: ${label}`;
    case "recall":   return `Recall: ${label}`;
    case "review":   return `Review: ${label}`;
    case "practice": return `Practice: ${label}`;
  }
}

function determineFocusLevel(goals: ConceptGoal[]): TodaysMission["focusLevel"] {
  if (goals.length === 0) return "mixed";
  const crit = goals.filter((g) => g.importanceLevel === "critical").length;
  const high = goals.filter((g) => g.importanceLevel === "high").length;
  if (crit / goals.length >= 0.5) return "critical";
  if ((crit + high) / goals.length >= 0.5) return "high";
  return "mixed";
}

// ---------------------------------------------------------------------------
// buildTodaysMission
// ---------------------------------------------------------------------------

/**
 * Build a personalized daily learning mission from canonical units and recall
 * history.
 *
 * Sort order of concept goals:
 *   1. Units missed in the most recent recall session (weak areas)
 *   2. Units due for SRS recall (dueAt ≤ now)
 *   3. Remaining units by importanceLevel (critical first)
 *   4. Completed units (streak ≥ 3) pushed to the end
 *
 * A unit is considered mastered (completed) when recall.streak ≥ 3 and
 * recall.correct is true.
 */
export function buildTodaysMission(
  units: ConceptUnit[],
  recallItems: RecallItem[],
  opts: MissionOpts = {},
): TodaysMission {
  const {
    bookTitle = "Study Material",
    now       = Date.now(),
    maxGoals  = 10,
  } = opts;

  const byUnitId = new Map<string, RecallItem>(
    recallItems.map((r) => [r.unitId, r]),
  );

  // Any unit answered incorrectly is a "missed" weak area regardless of dueAt.
  const missedRecently = recallItems
    .filter((r) => !r.correct)
    .map((r) => r.unitId);
  const missedSet = new Set(missedRecently);

  const goals: ConceptGoal[] = units.map((unit) => {
    const recall          = byUnitId.get(unit.id);
    const importanceLevel = resolveImportanceLevel(unit.importanceScore, unit.priorityTier);
    const completed       = !!recall && recall.streak >= 3 && recall.correct;
    const dueForRecall    = !!recall && recall.dueAt > 0 && recall.dueAt <= now;
    const weakArea        = missedSet.has(unit.id);

    return {
      id:               unit.id,
      label:            goalLabel(unit),
      canonicalType:    unit.canonicalType ?? "core-concept",
      importanceLevel,
      completed,
      dueForRecall,
      weakArea,
      estimatedMinutes: dueForRecall ? MINUTES_RECALL : MINUTES_READ,
      pageNumber:       unit.pageNumber,
    };
  });

  // Sort: weak → due → completed last → importance rank
  const sorted = [...goals].sort((a, b) => {
    if (a.weakArea !== b.weakArea)         return a.weakArea ? -1 : 1;
    if (a.dueForRecall !== b.dueForRecall) return a.dueForRecall ? -1 : 1;
    if (a.completed !== b.completed)       return a.completed ? 1 : -1;
    return IMPORTANCE_RANK[a.importanceLevel] - IMPORTANCE_RANK[b.importanceLevel];
  });

  const capped = sorted.slice(0, maxGoals);

  const recommendedSequence: LearningAction[] = capped.map((goal) => {
    const type: LearningActionType = goal.weakArea
      ? "review"
      : goal.dueForRecall
        ? "recall"
        : goal.completed
          ? "practice"
          : "read";
    return {
      type,
      label:           actionLabel(type, goal.label),
      unitId:          goal.id,
      estimatedMinutes: goal.estimatedMinutes,
      pageNumber:      goal.pageNumber,
    };
  });

  return {
    bookTitle,
    estimatedMinutes: capped.reduce((s, g) => s + g.estimatedMinutes, 0),
    focusLevel:       determineFocusLevel(capped),
    concepts:         capped,
    missedRecently,
    recommendedSequence,
  };
}
