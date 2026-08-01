// lib/recalllab/recall2Types.ts
// Recall 2.0 — type definitions.
// RecallBlueprint is the new card unit: real SM-2 scheduling, 4-level confidence,
// category-based question taxonomy, and full provenance.

/** 6-level question taxonomy, ordered from surface recall to expert transfer. */
export type RecallCategory =
  | "recognition"   // ★    identify / define
  | "understanding" // ★★   explain why / how
  | "procedure"     // ★★★  step-by-step process
  | "clinical"      // ★★★★ apply to a case scenario
  | "mistake"       // ★★★★ spot / avoid common errors
  | "transfer";     // ★★★★★ apply to a novel situation

/** 4-level confidence rating replacing Easy / Medium / Hard. */
export type ConfidenceLevel = "easy" | "unsure" | "guessed" | "blank";

/** Named study phases composing a full session. */
export type SessionPhase =
  | "warmup"    // recognition + understanding due cards
  | "weak"      // low easeFactor or recent misses
  | "clinical"  // clinical category due cards
  | "mixed"     // all remaining due cards
  | "mastery";  // transfer cards + long-interval retention tests

export interface RecallBlueprint {
  id: string;
  bookId: string;
  pageNumber?: number;

  // Card content
  category: RecallCategory;
  front: string;
  back: string;
  hint?: string;
  /** One sentence describing what mastering this card proves. */
  learningObjective?: string;

  // Provenance
  /** Human-readable source (e.g. "right-panel", "notelab"). */
  sourceLabel?: string;
  /** Canonical thought-unit ID this card was derived from. */
  canonicalUnitId?: string;
  /** djb2 hash of the lowercased front text — used for deduplication. */
  canonicalHash: string;

  // SM-2 SRS state
  /** Days until next review. Starts at 1. */
  interval: number;
  /** Ease factor 1.3–2.5, starts at 2.5. */
  easeFactor: number;
  /** ISO date (YYYY-MM-DD) — when this card is due next. */
  dueDate: string;
  /** ISO date of last review session. */
  lastReviewedAt?: string;
  /** Total number of times this card has been rated. */
  reviewCount: number;
  /** Consecutive correct (≥ unsure) ratings — resets on guessed/blank. */
  consecutiveCorrect: number;
  /** Last 10 confidence ratings, oldest first. */
  confidenceHistory: ConfidenceLevel[];

  createdAt: string; // ISO date
}

/** Aggregated session statistics for the dashboard. */
export interface Recall2Stats {
  due: number;
  weak: number;
  forgotten: number;
  mastered: number;
  total: number;
  /** Rough estimate based on 21 s per card. */
  estimatedMinutes: number;
}
