// lib/recalllab/recall2Srs.ts
// SM-2-based scheduling for Recall 2.0.
// Confidence levels map to SM-2 quality scores; the algorithm updates
// interval + easeFactor + dueDate deterministically.

import type { RecallBlueprint, ConfidenceLevel, SessionPhase, Recall2Stats } from "./recall2Types";

// ── Confidence → SM-2 quality ─────────────────────────────────────────────

const CONFIDENCE_QUALITY: Record<ConfidenceLevel, number> = {
  easy:    5,
  unsure:  3,
  guessed: 2,
  blank:   1,
};

const CONFIDENCE_EF_DELTA: Record<ConfidenceLevel, number> = {
  easy:     0.10,
  unsure:   0.00,
  guessed: -0.15,
  blank:   -0.20,
};

// ── Core SRS update ───────────────────────────────────────────────────────

/**
 * Apply one confidence rating to a blueprint and return the updated copy.
 * Never mutates the input.
 */
export function applyConfidence(bp: RecallBlueprint, confidence: ConfidenceLevel): RecallBlueprint {
  const quality  = CONFIDENCE_QUALITY[confidence];
  const todayStr = isoToday();

  const newEF = clamp(bp.easeFactor + CONFIDENCE_EF_DELTA[confidence], 1.3, 2.5);

  let newInterval: number;
  if (quality < 3) {
    // Wrong/guessed — partial or full reset
    newInterval = quality === 2
      ? Math.max(1, Math.round(bp.interval * 0.6))  // guessed: shrink
      : 1;                                            // blank:   restart
  } else if (bp.reviewCount === 0) {
    newInterval = 1;
  } else if (bp.reviewCount === 1) {
    newInterval = 3;
  } else {
    newInterval = Math.max(1, Math.round(bp.interval * newEF));
  }

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + newInterval);

  return {
    ...bp,
    interval:           newInterval,
    easeFactor:         newEF,
    dueDate:            nextDue.toISOString().slice(0, 10),
    lastReviewedAt:     todayStr,
    reviewCount:        bp.reviewCount + 1,
    consecutiveCorrect: quality >= 3 ? bp.consecutiveCorrect + 1 : 0,
    confidenceHistory:  [...(bp.confidenceHistory ?? []).slice(-9), confidence],
  };
}

// ── Retention estimate (Ebbinghaus forgetting curve) ─────────────────────

function retention(bp: RecallBlueprint): number {
  if (!bp.lastReviewedAt) return 1.0;
  const daysSince = (Date.now() - new Date(bp.lastReviewedAt).getTime()) / 86_400_000;
  const stability = Math.max(bp.interval * bp.easeFactor, 0.1);
  return Math.exp(-daysSince / stability);
}

function isWeak(bp: RecallBlueprint): boolean {
  return (
    bp.easeFactor < 1.7 ||
    bp.confidenceHistory.slice(-3).filter(c => c === "guessed" || c === "blank").length >= 2
  );
}

function isMastered(bp: RecallBlueprint): boolean {
  return bp.interval >= 21 && bp.easeFactor >= 2.0;
}

// ── Dashboard stats ───────────────────────────────────────────────────────

export function computeRecall2Stats(blueprints: RecallBlueprint[]): Recall2Stats {
  const today = isoToday();
  let due = 0, weak = 0, forgotten = 0, mastered = 0;

  for (const bp of blueprints) {
    if (isMastered(bp)) {
      mastered++;
    } else if (retention(bp) < 0.5) {
      forgotten++;
    } else if (isWeak(bp)) {
      weak++;
    } else if (bp.dueDate <= today) {
      due++;
    }
  }

  const activeCount = blueprints.filter(bp => bp.dueDate <= today || isWeak(bp)).length;
  return {
    due,
    weak,
    forgotten,
    mastered,
    total:            blueprints.length,
    estimatedMinutes: Math.max(1, Math.ceil(activeCount * 0.35)),
  };
}

// ── Session queue builder ─────────────────────────────────────────────────

/**
 * Build an ordered card queue for the requested phases.
 * Cards are deduplicated — each blueprint appears at most once.
 */
export function buildSessionQueue(
  blueprints: RecallBlueprint[],
  phases: SessionPhase[],
): RecallBlueprint[] {
  const today  = isoToday();
  const added  = new Set<string>();
  const queue: RecallBlueprint[] = [];

  const add = (bp: RecallBlueprint) => {
    if (!added.has(bp.id)) { added.add(bp.id); queue.push(bp); }
  };

  if (phases.includes("warmup")) {
    blueprints
      .filter(bp => bp.dueDate <= today && (bp.category === "recognition" || bp.category === "understanding"))
      .sort((a, b) => a.easeFactor - b.easeFactor)
      .forEach(add);
  }

  if (phases.includes("weak")) {
    blueprints
      .filter(bp => isWeak(bp))
      .sort((a, b) => a.easeFactor - b.easeFactor)
      .forEach(add);
  }

  if (phases.includes("clinical")) {
    blueprints
      .filter(bp => bp.category === "clinical" && bp.dueDate <= today)
      .forEach(add);
  }

  if (phases.includes("mixed")) {
    blueprints
      .filter(bp => bp.dueDate <= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .forEach(add);
  }

  if (phases.includes("mastery")) {
    blueprints
      .filter(bp => bp.category === "transfer" || (bp.interval >= 14 && bp.dueDate <= today))
      .forEach(add);
  }

  return queue;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
