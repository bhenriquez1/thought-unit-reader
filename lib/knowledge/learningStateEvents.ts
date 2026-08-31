// lib/knowledge/learningStateEvents.ts
// Deterministic event handling for KnowledgeNodeProgress (aka
// LearningConceptState). Every write to a learner's progress on a concept
// goes through applyLearningEvent() — a pure reducer: same progress + same
// event always produces the same output, with no internal Date.now()/
// Math.random() calls. Callers pass `occurredAt` explicitly (usually
// `new Date().toISOString()` at the call site, never inside this module),
// which is what makes state updates reproducible and testable — the exact
// requirement the Learning State Engine brief calls out.
//
// This is deliberately the ONE place that mutates progress scores. Modules
// (Recall, Whiteboard, DAT Apex, NoteLab) build an event describing what
// happened and call applyLearningEvent — they never hand-roll their own
// score-adjustment math against KnowledgeNodeProgress fields directly.

import type {
  KnowledgeNodeProgress,
  LearningEvidenceRef,
  LearningEvidenceSourceType,
} from "./knowledgeGraphSchema";
import { computeMastery } from "./computeMastery";

export type LearningStateEvent =
  // A concept was encountered without a graded outcome — a page was read,
  // a Whiteboard lesson started, NoteLab evidence was attached, etc.
  | { kind: "exposure"; sourceType: LearningEvidenceSourceType; occurredAt: string; sourceId: string; detail?: string }
  // A Recall card (or equivalent retrieval-practice item) was graded.
  | {
      kind: "recall-graded";
      difficulty: "easy" | "medium" | "hard";
      occurredAt: string;
      sourceId: string;
      /** Scheduling fields come from the same actual SRS rating. */
      nextReviewAt?: string;
      predictedForgetAt?: string;
    }
  // A Whiteboard "Professor" lesson for this concept finished playing.
  | {
      kind: "whiteboard-lesson-completed"; occurredAt: string; sourceId: string; snapshotId?: string;
      /** P0 stabilization, Tier 4 — the resolved page thesis (Surgeon-sourced
       *  when available, falling back to the legacy studyModel pipeline's own —
       *  same precedent WhiteboardPanel.tsx already uses for its title and save
       *  actions), appended to the reducer's own state-aware detail string
       *  (e.g. "lesson completed" vs "lesson replayed") so the evidence trail
       *  reads "lesson completed — Buffer Systems" instead of generic text
       *  with no indication of what topic it was. Raw thesis text only — the
       *  reducer owns the final phrasing, not the caller. Optional — omitting
       *  it keeps the prior detail string exactly as it was. */
      detail?: string;
    }
  // A DAT Apex question targeting this concept was answered.
  | { kind: "dat-question-answered"; correct: boolean; timeMs: number | null; occurredAt: string; sourceId: string }
  // The learner self-reported a confidence level (0-100).
  | { kind: "confidence-reported"; confidence: number; occurredAt: string; sourceId: string }
  // A specific misconception was observed (e.g. a wrong-answer explanation
  // matched a known misconception category).
  | { kind: "misconception-observed"; misconception: string; occurredAt: string; sourceId?: string }
  // Phase B3 — a single Whiteboard teaching step (one narrated point) played
  // to completion. Deliberately evidence-only: no score field changes here.
  // The coarser "watched the whole lesson" signal (whiteboard-lesson-completed
  // above) is what earns the modest understandingScore credit — per-step
  // completion is a finer-grained activity trail, not additional credit for
  // simply continuing to watch.
  // detail (Tier 4, optional): raw resolved page-thesis text, appended to
  // the reducer's own "step N completed" phrasing — see whiteboard-lesson-
  // completed's doc comment above for the full rationale.
  | { kind: "teaching-step-completed"; stepId: number; occurredAt: string; sourceId: string; detail?: string }
  // Phase B3 — a Professor/Whiteboard lesson began (its first teaching step
  // started). Evidence + exposure only, same shape as "exposure" above but
  // its own kind so a Whiteboard lesson start is distinguishable in the
  // evidence trail from a generic page-read exposure. Deliberately does NOT
  // grant understandingScore — only whiteboard-lesson-completed (finishing
  // the lesson) does that, and even then only once per distinct lesson (see
  // the whiteboard-lesson-completed case below).
  // detail (Tier 4, optional): raw resolved page-thesis text, appended to
  // the reducer's own "lesson started" phrasing.
  | { kind: "professor-lesson-started"; occurredAt: string; sourceId: string; detail?: string };

export function emptyProgress(nodeId: string, documentId: string): KnowledgeNodeProgress {
  return {
    nodeId,
    documentId,
    pageTruthKey: null,
    understandingScore: 0,
    recallScore: 0,
    memoryStrength: 0,
    masteryScore: 0,
    confidenceScore: 0,
    lastStudiedAt: null,
    lastReviewedAt: null,
    nextReviewAt: null,
    predictedForgetAt: null,
    exposureCount: 0,
    successfulRecallCount: 0,
    failedRecallCount: 0,
    missCount: 0,
    correctCount: 0,
    confusionNodeIds: [],
    observedMisconceptions: [],
    evidence: [],
    whiteboardSnapshotIds: [],
    datPerformance: null,
  };
}

/** P0 stabilization, Tier 4 — appends a caller-supplied detail (typically a
 *  resolved page thesis) to the reducer's own state-aware phrasing, rather
 *  than letting the caller replace it outright — "lesson completed" vs
 *  "lesson replayed" is information the caller can't reconstruct (only the
 *  reducer knows progress.whiteboardSnapshotIds), so it must never be lost. */
function withDetail(base: string, detail: string | undefined): string {
  return detail ? `${base} — ${detail}` : base;
}

function pushEvidence(
  progress: KnowledgeNodeProgress,
  sourceType: LearningEvidenceSourceType,
  sourceId: string,
  occurredAt: string,
  detail?: string,
): LearningEvidenceRef[] {
  const ref: LearningEvidenceRef = { sourceType, sourceId, occurredAt, ...(detail ? { detail } : {}) };
  // Cap at the most recent 200 entries — this is a rolling activity log for
  // display/audit, not an unbounded ledger.
  return [...progress.evidence, ref].slice(-200);
}

/** The one function that mutates a KnowledgeNodeProgress. Pure: returns a
 *  new object, never mutates `progress` in place, and produces the exact
 *  same output for the exact same (progress, event) input every time.
 *  masteryScore is always recomputed from the result via computeMastery()
 *  before returning — "composite — see computeMastery()" was already the
 *  field's own documented contract, but no write path actually did this
 *  until now, so masteryScore silently stayed 0 forever regardless of real
 *  recall/understanding/memory/confidence signal (confirmed: neither this
 *  reducer nor recordLearningEvent.ts ever set it). That's a real bug for
 *  any reader of the stored field — including the already-shipped
 *  KnowledgeStatePanel's selectRecentlyMastered, which has always compared
 *  against a value that could never rise above 0. */
export function applyLearningEvent(
  progress: KnowledgeNodeProgress,
  event: LearningStateEvent,
): KnowledgeNodeProgress {
  const next = reduceEvent(progress, event);
  return { ...next, masteryScore: computeMastery(next) };
}

function reduceEvent(
  progress: KnowledgeNodeProgress,
  event: LearningStateEvent,
): KnowledgeNodeProgress {
  switch (event.kind) {
    case "exposure": {
      return {
        ...progress,
        exposureCount: progress.exposureCount + 1,
        lastStudiedAt: event.occurredAt,
        evidence: pushEvidence(progress, event.sourceType, event.sourceId, event.occurredAt, event.detail),
      };
    }

    case "recall-graded": {
      const isEasy = event.difficulty === "easy";
      const isMedium = event.difficulty === "medium";
      const isHard = event.difficulty === "hard";
      const recallDelta = isEasy ? 10 : isMedium ? 5 : -10;
      const memoryDelta = isEasy ? 5 : isMedium ? 2 : -8;
      const succeeded = !isHard;
      return {
        ...progress,
        recallScore: clamp(progress.recallScore + recallDelta),
        memoryStrength: clamp(progress.memoryStrength + memoryDelta),
        exposureCount: progress.exposureCount + 1,
        successfulRecallCount: progress.successfulRecallCount + (succeeded ? 1 : 0),
        failedRecallCount: progress.failedRecallCount + (succeeded ? 0 : 1),
        correctCount: progress.successfulRecallCount + (succeeded ? 1 : 0),
        missCount: progress.failedRecallCount + (succeeded ? 0 : 1),
        lastReviewedAt: event.occurredAt,
        lastStudiedAt: event.occurredAt,
        nextReviewAt: event.nextReviewAt ?? progress.nextReviewAt,
        predictedForgetAt: event.predictedForgetAt ?? progress.predictedForgetAt,
        evidence: pushEvidence(progress, "recall", event.sourceId, event.occurredAt, `rated ${event.difficulty}`),
      };
    }

    case "whiteboard-lesson-completed": {
      // Phase B3: idempotent on replay — a snapshotId already present in
      // whiteboardSnapshotIds means THIS exact lesson has already been
      // credited once, so rewatching it does not grant understandingScore
      // again (only the first completion of a given lesson does). Replays
      // still count as exposure/activity (exposureCount, lastStudiedAt,
      // evidence) — only the mastery credit itself is capped at "once per
      // distinct lesson," not the activity trail.
      const alreadyCredited = !!event.snapshotId && progress.whiteboardSnapshotIds.includes(event.snapshotId);
      return {
        ...progress,
        understandingScore: alreadyCredited ? progress.understandingScore : clamp(progress.understandingScore + 8),
        exposureCount: progress.exposureCount + 1,
        lastStudiedAt: event.occurredAt,
        whiteboardSnapshotIds: event.snapshotId && !progress.whiteboardSnapshotIds.includes(event.snapshotId)
          ? [...progress.whiteboardSnapshotIds, event.snapshotId]
          : progress.whiteboardSnapshotIds,
        evidence: pushEvidence(
          progress, "whiteboard", event.sourceId, event.occurredAt,
          withDetail(alreadyCredited ? "lesson replayed" : "lesson completed", event.detail),
        ),
      };
    }

    case "dat-question-answered": {
      const prevDat = progress.datPerformance ?? { attempts: 0, correct: 0, lastAttemptedAt: null, averageTimeMs: null };
      const attempts = prevDat.attempts + 1;
      const correct = prevDat.correct + (event.correct ? 1 : 0);
      const averageTimeMs = event.timeMs == null
        ? prevDat.averageTimeMs
        : prevDat.averageTimeMs == null
          ? event.timeMs
          : Math.round((prevDat.averageTimeMs * prevDat.attempts + event.timeMs) / attempts);
      return {
        ...progress,
        recallScore: clamp(progress.recallScore + (event.correct ? 8 : -8)),
        exposureCount: progress.exposureCount + 1,
        successfulRecallCount: progress.successfulRecallCount + (event.correct ? 1 : 0),
        failedRecallCount: progress.failedRecallCount + (event.correct ? 0 : 1),
        correctCount: progress.successfulRecallCount + (event.correct ? 1 : 0),
        missCount: progress.failedRecallCount + (event.correct ? 0 : 1),
        lastReviewedAt: event.occurredAt,
        lastStudiedAt: event.occurredAt,
        datPerformance: { attempts, correct, lastAttemptedAt: event.occurredAt, averageTimeMs },
        evidence: pushEvidence(progress, "dat-question", event.sourceId, event.occurredAt, event.correct ? "correct" : "incorrect"),
      };
    }

    case "confidence-reported": {
      return {
        ...progress,
        confidenceScore: clamp(event.confidence),
        evidence: pushEvidence(progress, "recall", event.sourceId, event.occurredAt, `confidence ${event.confidence}`),
      };
    }

    case "misconception-observed": {
      return {
        ...progress,
        observedMisconceptions: progress.observedMisconceptions.includes(event.misconception)
          ? progress.observedMisconceptions
          : [...progress.observedMisconceptions, event.misconception],
        ...(event.sourceId
          ? { evidence: pushEvidence(progress, "recall", event.sourceId, event.occurredAt, `misconception: ${event.misconception}`) }
          : {}),
      };
    }

    case "teaching-step-completed": {
      return {
        ...progress,
        evidence: pushEvidence(
          progress, "whiteboard", event.sourceId, event.occurredAt,
          withDetail(`step ${event.stepId} completed`, event.detail),
        ),
      };
    }

    case "professor-lesson-started": {
      return {
        ...progress,
        exposureCount: progress.exposureCount + 1,
        lastStudiedAt: event.occurredAt,
        evidence: pushEvidence(progress, "whiteboard", event.sourceId, event.occurredAt, withDetail("lesson started", event.detail)),
      };
    }
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
