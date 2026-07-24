// lib/canonical/types.ts
// Canonical Thought Unit — single source of truth shared by Reader, DAT Apex,
// NoteLab, Recall, and Elena Mode.
//
// Immutable identity: id = `${documentId}:${pageIndex}:${unitIndex}`
// Stored in IDB store "canonical_units_v1".
// Never duplicated — consumers reference by ID.

// ────────────────────────────────────────────────────────────────────────────
// DAT classification
// ────────────────────────────────────────────────────────────────────────────

/** ADA DAT test section this unit maps to. */
export type DatSection =
  | 'biology'
  | 'general_chemistry'
  | 'organic_chemistry'
  | 'perceptual_ability'
  | 'reading_comprehension'
  | 'quantitative_reasoning'
  | 'none';

/** How this unit was classified. */
export type ClassificationSource =
  | 'title_keyword'      // classifyBook() on book title/id
  | 'content_lexicon'    // page-text lexicon scan
  | 'user_override'      // explicit user choice
  | 'unclassified';

/** DAT Blueprint topic string (maps to ExamProfile.topicBlueprint entries). */
export type DatTopic = string;

/** Broad role of this unit in DAT prep. */
export type DatUnitType =
  | 'definition'
  | 'mechanism'
  | 'clinical_application'
  | 'formula'
  | 'example'
  | 'contrast'
  | 'fact'
  | 'unknown';

// ────────────────────────────────────────────────────────────────────────────
// Reader highlight coordinates (for "View Source in Reader" navigation)
// ────────────────────────────────────────────────────────────────────────────

export interface ReaderAnchor {
  /** 0-based page index in the PDF. */
  pageIndex: number;
  /** Character offset where this unit starts in the page's extracted text. */
  startChar: number;
  /** Character offset where this unit ends. */
  endChar: number;
  /** Short representative quote (≤ 180 chars) for visual highlight restoration. */
  quote: string;
  /** Approximate vertical position (0–100) for scroll-to. */
  yPct?: number;
  /** PDF column when two-column layout is detected. */
  column?: 'left' | 'right' | 'full';
}

// ────────────────────────────────────────────────────────────────────────────
// Canonical Thought Unit
// ────────────────────────────────────────────────────────────────────────────

/**
 * A paragraph-level unit of meaning extracted from a PDF page.
 * This is the immutable source record that all downstream products consume.
 *
 * Reader:    renders highlights, enables "View Source" links
 * DAT Apex:  generates questions grounded in this unit
 * Recall:    schedules spaced-repetition reviews
 * Elena:     explains and quizzes based on this unit
 */
export interface CanonicalThoughtUnit {
  /** Immutable stable key: `${documentId}:${pageIndex}:${unitIndex}` */
  id: string;
  /** Matches the key used in the IDB "avrrio-documents" store. */
  documentId: string;
  /** 0-based page index in the PDF. */
  pageIndex: number;
  /** 0-based position of this unit among all units on the page. */
  unitIndex: number;
  /** The raw text of this unit (paragraph or multi-sentence chunk). */
  text: string;
  /** Character-level anchor for Reader highlight and jump-to-source. */
  anchor: ReaderAnchor;

  // ── DAT classification ────────────────────────────────────────────────────
  datSection: DatSection;
  datTopic: DatTopic;
  datSubtopic?: string;
  datUnitType: DatUnitType;
  /** 0–1; how well this unit aligns with the DAT blueprint for its section. */
  datRelevance: number;
  /** 0–1; confidence in the datSection classification. */
  classificationConfidence: number;
  classificationSource: ClassificationSource;

  // ── Difficulty estimate ───────────────────────────────────────────────────
  /** 0–1; higher = harder question to generate from this unit. */
  difficulty: number;

  // ── Provenance ────────────────────────────────────────────────────────────
  /** ID of the UltraNote this unit was originally derived from, if any. */
  sourceUltraNoteId?: string;
  /** IDs of EngineQuestions generated from this unit. */
  questionIds?: string[];

  createdAt: number;
  updatedAt: number;
}

// ────────────────────────────────────────────────────────────────────────────
// DATThoughtUnit — extends canonical with richer DAT-specific metadata
// populated after the exam engine processes the unit.
// ────────────────────────────────────────────────────────────────────────────

export interface DATThoughtUnit extends CanonicalThoughtUnit {
  /** ADA content spec version this unit targets (e.g. "2025"). */
  specificationVersion: string;
  /** Blueprint topic weight (0–1) from the active DatExamBlueprint. */
  blueprintWeight: number;
  /** Key terms extracted from this unit for distractor generation. */
  keyTerms: string[];
  /** Common misconceptions associated with this unit's topic. */
  commonMisconceptions: string[];
  /** Suggested question stems pre-generated for this unit. */
  questionStemHints?: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Helper — build a stable ID from coordinates
// ────────────────────────────────────────────────────────────────────────────

export function buildCanonicalId(
  documentId: string,
  pageIndex: number,
  unitIndex: number,
): string {
  return `${documentId}:${pageIndex}:${unitIndex}`;
}

/** Classify a DAT section from book-level classification result. */
export function datSectionFromSubject(
  subject: 'Biology' | 'General Chemistry' | 'Organic Chemistry' | 'Other',
): DatSection {
  switch (subject) {
    case 'Biology':           return 'biology';
    case 'General Chemistry': return 'general_chemistry';
    case 'Organic Chemistry': return 'organic_chemistry';
    default:                  return 'none';
  }
}
