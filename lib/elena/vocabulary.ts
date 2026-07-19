// lib/elena/vocabulary.ts
// Types for the Elena Vocabulary Builder — flashcard-based word learning
// integrated with the active PDF page. Words are extracted by AI, stored
// locally in IndexedDB, and tracked through three mastery states.

import type { ChildAgeRange } from "./types";

/* ─── Mastery state ──────────────────────────────────────────────────────────── */

export type VocabStatus = "new" | "reviewing" | "mastered";

export const VOCAB_STATUS_META: Record<VocabStatus, { label: string; emoji: string; color: string }> = {
  new:       { label: "New",       emoji: "✨", color: "text-sky-300"    },
  reviewing: { label: "Reviewing", emoji: "📚", color: "text-amber-300"  },
  mastered:  { label: "Mastered",  emoji: "⭐", color: "text-emerald-300" },
};

/* ─── Word record ────────────────────────────────────────────────────────────── */

export type VocabWord = {
  id:               string;
  childProfileId:   string;
  word:             string;
  definition:       string;
  exampleSentence:  string;
  emoji:            string;
  sourceBookTitle?: string;
  sourcePage?:      number;
  status:           VocabStatus;
  createdAt:        string;
  updatedAt:        string;
};

/* ─── API types ──────────────────────────────────────────────────────────────── */

export type VocabExtractRequest = {
  pageText:      string;
  ageRange?:     ChildAgeRange;
  bookTitle?:    string;
  currentPage?:  number;
};

export type VocabExtractedWord = {
  word:            string;
  definition:      string;
  exampleSentence: string;
  emoji:           string;
};

export type VocabExtractResponse = {
  words:  VocabExtractedWord[];
  error?: string;
};
