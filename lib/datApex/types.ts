// lib/datApex/types.ts
// Canonical domain types for the DAT Apex exam-simulation and learning product.

import type { DatSectionId } from "./blueprint";

/* ─── Attempt and response ─────────────────────────────────────────────────── */

export type DatResponse = {
  questionId:      string;
  sectionId:       DatSectionId;
  selectedChoiceId: "A" | "B" | "C" | "D" | "E" | null;  // null = unanswered
  isCorrect?:      boolean;    // populated after scoring; absent during simulation
  /** Milliseconds elapsed on this question */
  timeSpentMs?:    number;
  /** Whether the examinee flagged this question for review */
  flagged:         boolean;
};

export type DatAttempt = {
  id:              string;
  testFormId:      string;
  mode:            "practice" | "simulation";
  state:           DatSessionPhase;
  responses:       DatResponse[];
  /** Seconds remaining per section at pause/submit (sectionId → seconds) */
  timeRemainingSeconds: Record<string, number>;
  startedAt:       string;
  submittedAt?:    string;
  /** Populated after scoring */
  result?:         DatApexResult;
};

/* ─── Scoring ──────────────────────────────────────────────────────────────── */

/**
 * Readiness bands convey unofficial preparation level.
 * NEVER present these as ADA-issued scaled scores.
 */
export type ReadinessBand =
  | "foundation"    // significant preparation gaps
  | "developing"    // emerging proficiency, key gaps remain
  | "competitive"   // meets average applicant benchmark
  | "strong"        // above average, approaching top quartile
  | "exam-ready";   // consistently performing at passing level

export type DatSectionResult = {
  sectionId:      DatSectionId;
  rawCorrect:     number;
  totalQuestions: number;
  accuracy:       number;       // 0–1
  /** Per-topic accuracy breakdown (topicId → accuracy 0-1) */
  topicAccuracy:  Record<string, number>;
  timeSpentMs?:   number;
};

/**
 * Aggregate result produced after scoring a DatAttempt.
 * estimatedScaleRange is an unofficial readiness estimate — never an ADA score.
 */
export type DatApexResult = {
  attemptId:        string;
  totalRawCorrect:  number;
  totalQuestions:   number;
  accuracy:         number;      // 0–1
  sectionResults:   DatSectionResult[];
  readinessBand:    ReadinessBand;
  /** Low and high of unofficial estimated academic average equivalent */
  estimatedScaleRange?: { low: number; high: number };
  /** Confidence in the estimate (0-1); low when sample size is small */
  confidence:       number;
  /** Scoring model version used (e.g. "ada-2025") */
  modelVersion:     string;
  scoredAt:         string;
};

/* ─── Error classification ─────────────────────────────────────────────────── */

/**
 * Fine-grained diagnosis of why a question was answered incorrectly.
 * Powers targeted review recommendations.
 */
export type DatErrorClassification = {
  questionId:         string;
  attemptId:          string;
  errorType:
    | "conceptual-gap"        // fundamental concept not understood
    | "knowledge-gap"         // specific fact not memorized
    | "calculation-error"     // arithmetic or unit error
    | "misread-question"      // correct reasoning, wrong interpretation
    | "distractor-trap"       // chose a plausible wrong answer
    | "time-pressure"         // rushed; time spent < 30s
    | "unknown";
  notes?:             string;
  classifiedAt:       string;
};

/* ─── Readiness state ──────────────────────────────────────────────────────── */

/**
 * Rolling readiness snapshot for a user's DAT Apex account.
 * Aggregated from multiple attempts across both practice and simulation modes.
 */
export type DatReadinessState = {
  userId:               string;
  overallBand:          ReadinessBand;
  /** Per-section readiness bands (sectionId → band) */
  sectionBands:         Record<string, ReadinessBand>;
  /** Per-topic accuracy rolling average (topicId → 0-1) */
  topicAccuracy:        Record<string, number>;
  totalAttempts:        number;
  totalQuestionsAnswered: number;
  lastActivityAt:       string;
  updatedAt:            string;
};

/* ─── Session phase ────────────────────────────────────────────────────────── */

/**
 * Valid phases of a DAT Apex exam session.
 * "paused" is only reachable in practice mode; simulation mode never pauses.
 */
export type DatSessionPhase =
  | "idle"
  | "tutorial"
  | "in-section"
  | "break"
  | "paused"         // practice only
  | "final-review"
  | "submitted";
