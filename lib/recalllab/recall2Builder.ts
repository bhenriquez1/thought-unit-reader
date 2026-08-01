// lib/recalllab/recall2Builder.ts
// Converts existing RecallCard / RecallSet objects into RecallBlueprints,
// and provides helpers for creating blueprints from canonical thought units.
// This is the migration path: existing IDB cards → Recall 2.0 format.

import type { RecallCard, RecallSet } from "./recallStore";
import type { RecallBlueprint, RecallCategory } from "./recall2Types";
import { canonicalHash, newBlueprint } from "./recall2Store";

// ── CardType → RecallCategory mapping ────────────────────────────────────

const CARD_TYPE_CATEGORY: Record<string, RecallCategory> = {
  "fact":         "recognition",
  "concept":      "understanding",
  "mechanism":    "procedure",
  "application":  "clinical",
  "dat-question": "clinical",
  "weak-review":  "mistake",
};

// ── Migration: RecallCard → RecallBlueprint ───────────────────────────────

/**
 * Convert a single RecallCard (from an existing RecallSet) to a RecallBlueprint.
 * Preserves SRS history: streak → interval, isMissed → easeFactor penalty.
 */
export function recallCardToBlueprint(card: RecallCard, set: RecallSet): RecallBlueprint {
  const category  = CARD_TYPE_CATEGORY[card.type] ?? "understanding";
  const today     = new Date().toISOString().slice(0, 10);
  const streak    = card.correctStreak ?? 0;
  const baseInterval = streak >= 4 ? 14 : streak >= 2 ? 3 : 1;
  const baseFactor   = card.isMissed ? 2.0 : 2.5;

  return {
    id:                 `bp-${card.id}`,
    bookId:             set.bookId,
    pageNumber:         set.pageNumber,
    category,
    front:              card.front,
    back:               card.back,
    hint:               card.hint,
    sourceLabel:        set.sourceLabel,
    canonicalUnitId:    undefined,
    canonicalHash:      canonicalHash(card.front.toLowerCase().slice(0, 120)),
    interval:           baseInterval,
    easeFactor:         baseFactor,
    dueDate:            today,
    lastReviewedAt:     card.lastReviewedAt
                          ? new Date(card.lastReviewedAt).toISOString().slice(0, 10)
                          : undefined,
    reviewCount:        card.reviewCount,
    consecutiveCorrect: streak,
    confidenceHistory:  [],
    createdAt:          new Date(set.createdAt).toISOString().slice(0, 10),
  };
}

/** Convert all cards in a RecallSet to RecallBlueprints. */
export function recallSetToBlueprints(set: RecallSet): RecallBlueprint[] {
  return set.cards.map(card => recallCardToBlueprint(card, set));
}

// ── Builder: canonical thought unit entries → RecallBlueprints ───────────

export interface CanonicalBlueprintEntry {
  id: string;
  text: string;
  title?: string;
  canonicalType?: string;
  importanceScore?: number;
}

const CANONICAL_TYPE_CATEGORY: Record<string, RecallCategory> = {
  "definition":       "recognition",
  "core-concept":     "understanding",
  "cause":            "understanding",
  "effect":           "understanding",
  "process":          "procedure",
  "mechanism":        "procedure",
  "formula":          "recognition",
  "worked-example":   "procedure",
  "indication":       "clinical",
  "contraindication": "clinical",
  "treatment":        "clinical",
  "complication":     "clinical",
  "clinical-pearl":   "clinical",
  "decision-point":   "clinical",
  "warning":          "mistake",
  "high-yield":       "understanding",
  "memory-anchor":    "recognition",
  "classification":   "recognition",
  "relationship":     "understanding",
  "evidence":         "transfer",
};

const QUESTION_STEM: Record<string, string> = {
  "definition":       "Define:",
  "core-concept":     "What is the core concept of:",
  "cause":            "What causes:",
  "effect":           "What is the effect of:",
  "process":          "Describe the process of:",
  "mechanism":        "Explain the mechanism of:",
  "formula":          "State the formula for:",
  "worked-example":   "Walk through the example:",
  "indication":       "What is indicated for:",
  "contraindication": "What is contraindicated in:",
  "treatment":        "What is the treatment for:",
  "complication":     "What complication is associated with:",
  "clinical-pearl":   "State the clinical pearl for:",
  "decision-point":   "What decision applies to:",
  "warning":          "What is the warning about:",
  "high-yield":       "What is the high-yield point about:",
  "memory-anchor":    "How do you remember:",
  "classification":   "How is this classified:",
  "relationship":     "Describe the relationship between:",
  "evidence":         "What evidence supports:",
};

/**
 * Build RecallBlueprints from canonical thought units.
 * Suitable for saving via saveBlueprintsDedup (auto-deduplicates by hash).
 */
export function canonicalEntriesToBlueprints(
  entries: CanonicalBlueprintEntry[],
  opts: { bookId: string; pageNumber?: number; sourceLabel?: string },
): RecallBlueprint[] {
  return entries.map(entry => {
    const ct       = entry.canonicalType ?? "core-concept";
    const stem     = QUESTION_STEM[ct] ?? "Explain:";
    const label    = entry.title ?? entry.text.slice(0, 60).trim();
    const back     = entry.text.length > 350 ? entry.text.slice(0, 350).trim() + "…" : entry.text;
    const category = CANONICAL_TYPE_CATEGORY[ct] ?? "understanding";

    return {
      ...newBlueprint(`${stem} ${label}`, back, category, {
        bookId:         opts.bookId,
        pageNumber:     opts.pageNumber,
        canonicalUnitId: entry.id,
        sourceLabel:    opts.sourceLabel ?? "right-panel",
      }),
      // Override the random id with a stable one so re-generation preserves SRS history
      id: `bp-cu-${ct}-${entry.id}`,
    };
  });
}
