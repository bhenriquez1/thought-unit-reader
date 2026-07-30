// lib/recalllab/canonicalRecall.ts
// Bridges the canonical thought unit pipeline → RecallLab card generation.
// Phase 6: Recall Engine grounded in canonical semantic metadata.
//
//   Canonical Units → canonicalToRecallCards() → RecallSet → RecallLab
//
// Cards are generated from canonicalType-specific question stems and sorted
// by importance (critical first) so the highest-value concepts surface first
// in a quiz session.

import { resolveImportanceLevel, type ImportanceLevel } from "@/lib/reader/importanceBadge";
import { inferSubject, type NoteSubject } from "@/lib/notelab/ultraNoteStore";
import { stableRecallId, type RecallCard, type CardType, type RecallSet } from "./recallStore";

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface CanonicalRecallInput {
  id: string;
  text: string;
  title?: string;
  canonicalType?: string;
  importanceScore?: number;
  priorityTier?: number;
  page?: number;
}

// ---------------------------------------------------------------------------
// canonicalType → question stem
// ---------------------------------------------------------------------------

const QUESTION_STEM: Partial<Record<string, string>> = {
  "definition":        "Define:",
  "core-concept":      "What is the core concept of:",
  "cause":             "What causes:",
  "effect":            "What is the effect of:",
  "process":           "Describe the process of:",
  "mechanism":         "Explain the mechanism of:",
  "indication":        "What is indicated for:",
  "contraindication":  "What is contraindicated in:",
  "warning":           "⚠️ What is the warning about:",
  "high-yield":        "What is the high-yield point about:",
  "clinical-pearl":    "State the clinical pearl for:",
  "formula":           "State the formula for:",
  "worked-example":    "Work through the example:",
  "treatment":         "What is the treatment for:",
  "complication":      "What complication is caused by:",
  "evidence":          "What evidence supports:",
  "memory-anchor":     "How do you remember:",
  "decision-point":    "What decision applies to:",
  "classification":    "How is the following classified:",
  "relationship":      "Describe the relationship:",
};

// ---------------------------------------------------------------------------
// canonicalType → CardType
// ---------------------------------------------------------------------------

const CANONICAL_CARD_TYPE: Partial<Record<string, CardType>> = {
  "definition":        "concept",
  "core-concept":      "concept",
  "cause":             "mechanism",
  "effect":            "mechanism",
  "process":           "mechanism",
  "mechanism":         "mechanism",
  "indication":        "application",
  "contraindication":  "application",
  "warning":           "concept",
  "high-yield":        "fact",
  "clinical-pearl":    "application",
  "formula":           "fact",
  "worked-example":    "application",
  "treatment":         "application",
  "complication":      "application",
  "evidence":          "fact",
  "memory-anchor":     "fact",
  "decision-point":    "application",
  "classification":    "concept",
  "relationship":      "concept",
};

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  critical:  0,
  high:      1,
  medium:    2,
  reference: 3,
};

// ---------------------------------------------------------------------------
// canonicalToRecallCards
// ---------------------------------------------------------------------------

/**
 * Convert canonical thought units into RecallCards.
 *
 * Cards are sorted critical-first so the most important concepts appear
 * first in a quiz session. Text is truncated at 300 chars to keep cards
 * scannable. The card ID encodes the canonical type and ordinal so
 * saveRecallSet can preserve SRS history across re-generations.
 *
 * @param entries   Canonical thought units for the current page.
 * @param maxCards  Cap on generated cards (default 20).
 */
export function canonicalToRecallCards(
  entries: CanonicalRecallInput[],
  maxCards = 20,
): RecallCard[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => {
    const aL = resolveImportanceLevel(a.importanceScore, a.priorityTier);
    const bL = resolveImportanceLevel(b.importanceScore, b.priorityTier);
    return IMPORTANCE_RANK[aL] - IMPORTANCE_RANK[bL];
  });

  return sorted.slice(0, maxCards).map((entry, ordinal) =>
    buildCardFromEntry(entry, ordinal),
  );
}

function buildCardFromEntry(entry: CanonicalRecallInput, ordinal: number): RecallCard {
  const ct    = entry.canonicalType ?? "core-concept";
  const stem  = QUESTION_STEM[ct] ?? "Explain:";
  const label = entry.title ?? entry.text.slice(0, 50).trim();
  const back  = entry.text.length > 300
    ? entry.text.slice(0, 300).trim() + "…"
    : entry.text;

  return {
    id:          `cu-${ct}-${ordinal}-${entry.id}`,
    type:        CANONICAL_CARD_TYPE[ct] ?? "concept",
    front:       `${stem} ${label}`,
    back,
    reviewCount: 0,
    isMissed:    false,
  };
}

// ---------------------------------------------------------------------------
// buildRecallSetFromCanonical
// ---------------------------------------------------------------------------

export interface CanonicalRecallSetOpts {
  bookId: string;
  pageNumber: number;
  pageTitle?: string;
  bookTitle?: string;
  subject?: NoteSubject;
}

/**
 * Build a RecallSet from canonical thought units.
 *
 * The returned set can be passed directly to saveRecallSet() and will
 * participate in the existing IDB-primary SRS flow. Card IDs are stable
 * (encoding canonical type + ordinal + unit id) so SRS history is preserved
 * across re-generations when the same canonical units come from the same page.
 */
export function buildRecallSetFromCanonical(
  entries: CanonicalRecallInput[],
  opts: CanonicalRecallSetOpts,
): RecallSet {
  const cards = canonicalToRecallCards(entries);
  const topic = opts.pageTitle ?? `Page ${opts.pageNumber}`;

  return {
    id:          stableRecallId(opts.bookId, opts.pageNumber, "canonical"),
    bookId:      opts.bookId,
    bookTitle:   opts.bookTitle,
    sourceLabel: "right-panel",
    pageNumber:  opts.pageNumber,
    subject:     opts.subject ?? inferSubject(opts.bookId),
    topic,
    cards,
    createdAt:   Date.now(),
  };
}

// ---------------------------------------------------------------------------
// importanceFilteredEntries
// ---------------------------------------------------------------------------

/**
 * Filter canonical entries by minimum importance level.
 * Useful for building a "critical-only" recall set for exam mode.
 */
export function importanceFilteredEntries(
  entries: CanonicalRecallInput[],
  minLevel: ImportanceLevel,
): CanonicalRecallInput[] {
  const minRank = IMPORTANCE_RANK[minLevel];
  return entries.filter((e) => {
    const level = resolveImportanceLevel(e.importanceScore, e.priorityTier);
    return IMPORTANCE_RANK[level] <= minRank;
  });
}
