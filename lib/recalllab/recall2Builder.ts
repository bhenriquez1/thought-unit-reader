// lib/recalllab/recall2Builder.ts
// Converts existing RecallCard / RecallSet objects into RecallBlueprints,
// and provides helpers for creating blueprints from canonical thought units.
// This is the migration path: existing IDB cards → Recall 2.0 format.

import type { RecallCard, RecallSet } from "./recallStore";
import type { RecallBlueprint, RecallCategory } from "./recall2Types";
import { canonicalHash, newBlueprint } from "./recall2Store";
import { buildSemanticCards } from "./semanticQuestionFamilies";

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
    documentId:         set.documentId,
    pageTruthKey:       set.pageTruthKey,
    knowledgeNodeId:    set.knowledgeNodeId,
    sourceKind:         "legacy",
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

/**
 * Build RecallBlueprints from canonical thought units using semantic-type-aware
 * question families. Each entry produces N blueprints (one per applicable family),
 * capped at 3 per unit to avoid flooding the deck. Duplicates are removed by
 * canonical hash before the caller writes to IDB.
 */
export function canonicalEntriesToBlueprints(
  entries: CanonicalBlueprintEntry[],
  opts: { bookId: string; pageNumber?: number; sourceLabel?: string },
): RecallBlueprint[] {
  const results: RecallBlueprint[] = [];
  const seenHashes = new Set<string>();

  for (const entry of entries) {
    const ct       = entry.canonicalType ?? "core-concept";
    const category = CANONICAL_TYPE_CATEGORY[ct] ?? "understanding";
    const back     = entry.text.length > 350 ? entry.text.slice(0, 350).trim() + "…" : entry.text;

    for (const card of buildSemanticCards(entry, { maxCards: 3 })) {
      const hash = canonicalHash(card.front.toLowerCase().slice(0, 120));
      if (seenHashes.has(hash)) continue;
      seenHashes.add(hash);

      results.push({
        ...newBlueprint(card.front, back, category, {
          bookId:          opts.bookId,
          pageNumber:      opts.pageNumber,
          canonicalUnitId: entry.id,
          sourceLabel:     opts.sourceLabel ?? "right-panel",
        }),
        id: `bp-cu-${ct}-${card.family}-${entry.id}`,
      });
    }
  }

  return results;
}
