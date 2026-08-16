// lib/canonical/types.ts
// Canonical Thought Unit — single source of truth shared by Reader, DAT Apex,
// NoteLab, Recall, and Elena Mode.
//
// Immutable identity: id = `${documentId}:${pageIndex}:${unitIndex}`
// Stored in IDB store "canonical_units_v1".
// Never duplicated — consumers reference by ID.

import type { CanonicalSemanticType } from "../semantic/types";

// ────────────────────────────────────────────────────────────────────────────
// DAT classification
//
// DatSection/DatTopic/DatUnitType/ClassificationSource now live in
// lib/examEngine/datClassification.ts — the exam-engine layer, not the
// shared canonical layer, owns DAT's vocabulary. Re-exported here so every
// existing `import { DatSection } from "@/lib/canonical/types"` keeps
// working unchanged; the CanonicalThoughtUnit fields below still carry
// these values directly (see the note on CanonicalThoughtUnit itself).
// ────────────────────────────────────────────────────────────────────────────

export type {
  DatSection,
  ClassificationSource,
  DatTopic,
  DatUnitType,
} from "../examEngine/datClassification";
export { datSectionFromSubject } from "../examEngine/datClassification";
import type { DatSection, DatTopic, DatUnitType, ClassificationSource } from "../examEngine/datClassification";

/**
 * Semantic highlight label — marks what kind of learning value this unit carries.
 * Assigned by the paragraph scorer / highlighting engine.
 *
 * MASTER         — foundational concept required to understand everything else on this page
 * DEFINITION     — precise term definition (memorize the exact wording)
 * PROCEDURE      — step-by-step process, algorithm, or sequence (enumerate-and-apply)
 * MECHANISM      — causal explanation of how/why something works
 * FORMULA        — mathematical or chemical equation with variables
 * WORKED-EXAMPLE — solved sample problem showing method step-by-step
 * EXCEPTION      — rule-breaker or special case that breaks the general pattern
 * COMMON-ERROR   — frequent student mistake or misconception
 * CLINICAL-PEARL — high-yield clinical/exam fact that separates top scorers
 * DAT-TIP        — exam-strategy or test-taking hint specific to the DAT
 */
export type SemanticLabel =
  | 'master'
  | 'definition'
  | 'procedure'
  | 'mechanism'
  | 'formula'
  | 'worked-example'
  | 'exception'
  | 'common-error'
  | 'clinical-pearl'
  | 'dat-tip';

// ────────────────────────────────────────────────────────────────────────────
// Geometry and provenance types
// ────────────────────────────────────────────────────────────────────────────

/** PDF-point bounding box (scale=1, origin bottom-left of the page). */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How reliably the anchor was matched back to PDF.js geometry.
 * "exact"     — char offsets matched a ParagraphMapping from the bridge.
 * "normalized" — matched after whitespace normalisation.
 * "fuzzy"     — matched via quote substring search (no bridge available).
 * "ocr"       — matched against OCR output; coordinates may drift.
 * "synthetic" — built without any PDF geometry (e.g. plain-text import).
 */
export type GroundingState = "exact" | "normalized" | "fuzzy" | "ocr" | "synthetic";

/**
 * Write-once metadata describing how a CanonicalThoughtUnit was produced.
 * Never mutate an existing record; bump extractorVersion and re-generate.
 */
export interface CanonicalProvenance {
  /** Unix timestamp (ms) when this unit was extracted. */
  readonly extractedAt: number;
  /** Version of the extractor that populated pdfTextItemIndexes / boundingBoxes. */
  readonly extractorVersion: number;
  /** Version of the column-detection / structure algorithm (STRUCTURE_VERSION). */
  readonly structureVersion: number;
  /** Version of the paragraph boundary algorithm (PARAGRAPH_ALGORITHM_VERSION). */
  readonly paragraphAlgorithmVersion: number;
  /** Whether PDF.js item-level geometry was available when this unit was built. */
  readonly hasGeometricGrounding: boolean;
}

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

  // ── Phase 1B: PDF geometry provenance ──────────────────────────────────────
  /** The exact source text as it appears in the structured page output. */
  exactSourceText?: string;
  /** Whitespace-normalised version of the source text (for change-tolerant lookup). */
  normalizedSourceText?: string;
  /** PDF.js textContent.items indexes that cover this anchor's text. */
  pdfTextItemIndexes?: number[];
  /** PDF-point bounding boxes (scale=1) for each item in pdfTextItemIndexes. */
  boundingBoxes?: BoundingBox[];
  /** How reliably the anchor was grounded to the PDF geometry. */
  groundingState?: GroundingState;
  /** 0–1 confidence in the grounding result. */
  groundingConfidence?: number;
  /** Schema version — bump when new fields are added to ReaderAnchor. */
  anchorVersion?: number;
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

  // ── Semantic highlight label ──────────────────────────────────────────────
  /**
   * What kind of learning value this unit carries — used by the highlighting
   * engine to render distinct badge colors in the Reader margin.
   * Derived from canonicalType via mapToSemanticLabel() in semanticScoring.ts.
   */
  semanticLabel?: SemanticLabel;
  /**
   * Canonical type from the semantic pack engine (replaces semanticLabel for
   * new consumers). Assigned alongside semanticLabel during the transition
   * period; eventually semanticLabel will be derived from this field.
   */
  canonicalType?: CanonicalSemanticType;
  /**
   * Chapter identifier this unit belongs to — used as the secondary key in
   * SemanticDomainAssignment IDB lookups.
   */
  chapterId?: string;

  // ── Phase 1B: canonical grounding ────────────────────────────────────────
  /**
   * Stable content-addressed hash: djb2 of `documentId|pageIndex|normalizedText`.
   * Stable across re-indexings as long as the text content is unchanged.
   */
  canonicalHash?: string;
  /** Immutable extraction provenance — write-once at build time. */
  provenance?: CanonicalProvenance;
  /** Salience 0–1; higher = more important for study. Populated in Phase 1C. */
  importanceScore?: number;
  /** 0–1 confidence that canonicalType is correct. Populated in Phase 1C. */
  semanticConfidence?: number;
  /** 0–1 confidence that the domain classifier picked the right domain. */
  domainConfidence?: number;
  /** Version of the scoring/classification algorithm. Populated in Phase 1C. */
  scoringVersion?: number;

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
