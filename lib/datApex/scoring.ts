// lib/datApex/scoring.ts
// Canonical scoring pipeline: DatAttempt + question answers → DatApexResult.
//
// This implements the "ada-2025" scoring model:
//  - Per-section accuracy from raw responses
//  - Per-topic accuracy from question topic metadata
//  - ReadinessBand from composite accuracy
//  - Unofficial estimated scale range (ADA 17–30 equivalent)
//  - Confidence score based on sample size

import type { DatAttempt, DatApexResult, DatSectionResult, ReadinessBand } from "./types";
import type { DatSectionId } from "./blueprint";
import { ACTIVE_DAT_BLUEPRINT } from "./activeBlueprint";
import { normalizeSectionId } from "./sectionIdBridge";

const SCORING_MODEL_VERSION = "ada-2025";

/* ─── Question answer source ─────────────────────────────────────────────────── */

/** Minimal interface for question metadata needed by scoring. */
export interface ScoringQuestion {
  id: string;
  /** The correct answer choice. */
  correctAnswer: "A" | "B" | "C" | "D" | "E";
  /** Blueprint topic ID or display topic (e.g. "cell-biology", "Cell Biology"). */
  topic?: string;
  /** Sub-section section ID — may be any of the known formats. */
  sectionId?: string;
}

/* ─── ReadinessBand thresholds ───────────────────────────────────────────────── */

function accuracyToBand(accuracy: number): ReadinessBand {
  if (accuracy >= 0.82) return "exam-ready";
  if (accuracy >= 0.70) return "strong";
  if (accuracy >= 0.58) return "competitive";
  if (accuracy >= 0.44) return "developing";
  return "foundation";
}

/** Unofficial estimated ADA-equivalent scale range (17–30).
 *  These are internally calibrated to readiness bands — NOT official ADA scores. */
function bandToScaleRange(band: ReadinessBand): { low: number; high: number } {
  switch (band) {
    case "exam-ready":  return { low: 22, high: 26 };
    case "strong":      return { low: 20, high: 23 };
    case "competitive": return { low: 18, high: 21 };
    case "developing":  return { low: 16, high: 19 };
    case "foundation":  return { low: 14, high: 17 };
  }
}

/** Confidence: scales with number of answered questions; saturates at ~40. */
function confidenceScore(totalAnswered: number): number {
  return Math.min(totalAnswered / 40, 1);
}

/* ─── Per-section scoring ────────────────────────────────────────────────────── */

function scoreSection(
  sectionId: DatSectionId,
  responses: DatAttempt["responses"],
  questions: ScoringQuestion[],
): DatSectionResult {
  const questionById = new Map(questions.map((q) => [q.id, q]));

  const sectionResponses = responses.filter((r) => {
    // Match by canonical sectionId or by normalized response sectionId
    const normalized = normalizeSectionId(r.sectionId);
    return normalized === sectionId;
  });

  const topicCorrect: Record<string, number> = {};
  const topicTotal: Record<string, number> = {};
  let rawCorrect = 0;
  let timeSpentMs = 0;

  for (const resp of sectionResponses) {
    const q = questionById.get(resp.questionId);
    if (!q || resp.selectedChoiceId === null) continue;

    const correct = resp.selectedChoiceId === q.correctAnswer;
    if (correct) rawCorrect++;

    const topicKey = (q.topic ?? "unknown").toLowerCase().replace(/\s+/g, "-");
    topicCorrect[topicKey] = (topicCorrect[topicKey] ?? 0) + (correct ? 1 : 0);
    topicTotal[topicKey]   = (topicTotal[topicKey]   ?? 0) + 1;

    if (resp.timeSpentMs) timeSpentMs += resp.timeSpentMs;
  }

  const total = sectionResponses.filter((r) => r.selectedChoiceId !== null).length;
  const accuracy = total > 0 ? rawCorrect / total : 0;

  const topicAccuracy: Record<string, number> = {};
  for (const [topic, tot] of Object.entries(topicTotal)) {
    topicAccuracy[topic] = tot > 0 ? (topicCorrect[topic] ?? 0) / tot : 0;
  }

  return {
    sectionId,
    rawCorrect,
    totalQuestions: total,
    accuracy,
    topicAccuracy,
    timeSpentMs: timeSpentMs > 0 ? timeSpentMs : undefined,
  };
}

/* ─── Main scoring function ──────────────────────────────────────────────────── */

export function scoreDatAttempt(
  attempt: DatAttempt,
  questions: ScoringQuestion[],
  modelVersion = SCORING_MODEL_VERSION,
): DatApexResult {
  // Resolve sub-section IDs from blueprint
  const subSectionIds: DatSectionId[] = [];
  for (const section of ACTIVE_DAT_BLUEPRINT.sections) {
    for (const sub of section.subSections) {
      subSectionIds.push(sub.id);
    }
  }

  // Mark correctness on responses
  const questionById = new Map(questions.map((q) => [q.id, q]));
  const scoredResponses = attempt.responses.map((r) => {
    const q = questionById.get(r.questionId);
    return { ...r, isCorrect: q ? r.selectedChoiceId === q.correctAnswer : undefined };
  });

  // Score each sub-section
  const modifiedAttempt = { ...attempt, responses: scoredResponses };
  const sectionResults: DatSectionResult[] = subSectionIds.map((sid) =>
    scoreSection(sid, modifiedAttempt.responses, questions),
  );

  // Aggregate
  let totalCorrect = 0;
  let totalAnswered = 0;
  for (const r of scoredResponses) {
    if (r.selectedChoiceId !== null) {
      totalAnswered++;
      if (r.isCorrect) totalCorrect++;
    }
  }

  const accuracy = totalAnswered > 0 ? totalCorrect / totalAnswered : 0;
  const readinessBand = accuracyToBand(accuracy);

  return {
    attemptId:           attempt.id,
    totalRawCorrect:     totalCorrect,
    totalQuestions:      totalAnswered,
    accuracy,
    sectionResults,
    readinessBand,
    estimatedScaleRange: bandToScaleRange(readinessBand),
    confidence:          confidenceScore(totalAnswered),
    modelVersion,
    scoredAt:            new Date().toISOString(),
  };
}

/* ─── Quick accuracy lookup ──────────────────────────────────────────────────── */

/** Returns per-section accuracy from a scored result (sectionId → 0–1). */
export function sectionAccuracyMap(result: DatApexResult): Record<DatSectionId, number> {
  const out: Partial<Record<DatSectionId, number>> = {};
  for (const sr of result.sectionResults) {
    out[sr.sectionId] = sr.accuracy;
  }
  return out as Record<DatSectionId, number>;
}
