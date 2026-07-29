// lib/datApex/canonicalQuestionMapper.ts
// Phase 7: map canonical thought units → DAT question stubs.
//
// Each stub is grounded in a specific CanonicalThoughtUnit and carries the
// unit's ReaderAnchor so the UI can offer "View Source in Reader" navigation
// back to the exact passage the question was generated from.
//
// Pipeline:
//   CanonicalThoughtUnit[]
//     → canonicalUnitsToDatStubs()
//       → DatQuestionStub[]  (sorted by datRelevance, filtered by threshold)
//         → passed to ExamGenerator or shown inline in DATApex panels

import type { CanonicalThoughtUnit, ReaderAnchor, DatSection, DatTopic, DatUnitType } from "@/lib/canonical/types";

// ---------------------------------------------------------------------------
// DatQuestionStub
// ---------------------------------------------------------------------------

/**
 * A lightweight question hint grounded in a single CanonicalThoughtUnit.
 *
 * The stub is not yet a full DATQuestion — it provides the suggested stem,
 * DAT classification, and ReaderAnchor. The question engine (ExamGenerator)
 * fills in distractors and a correct answer from the unit's text.
 */
export interface DatQuestionStub {
  /** Stable ID of the source CanonicalThoughtUnit. */
  canonicalUnitId: string;
  /** Exact location in the source PDF — enables "View Source in Reader". */
  sourceAnchor: ReaderAnchor;
  /** Book-level identifier, when available. */
  sourceBookId?: string;

  /** DAT section this question targets. */
  datSection: DatSection;
  /** Blueprint topic within that section. */
  datTopic: DatTopic;
  /** Structural role of the source unit (definition / mechanism / formula…). */
  datUnitType: DatUnitType;
  /** 0–1; how closely the source unit aligns to the DAT blueprint. */
  datRelevance: number;

  /** Suggested question stem derived from canonicalType + text. */
  questionStem: string;
  /** Semantic canonical type of the source unit (if set). */
  canonicalType?: string;
  /** 0–1 difficulty estimate from the source unit. */
  difficulty: number;
  /** Recommended question format for this stub. */
  suggestedType: "multiple-choice" | "short-answer";
}

// ---------------------------------------------------------------------------
// Question stem templates
// ---------------------------------------------------------------------------

/** Templates keyed by canonicalType (CanonicalSemanticType values). */
const CANONICAL_STEM: Partial<Record<string, (label: string) => string>> = {
  "definition":        (l) => `Which of the following best defines ${l}?`,
  "core-concept":      (l) => `Which statement most accurately describes ${l}?`,
  "cause":             (l) => `What is the primary cause of ${l}?`,
  "effect":            (l) => `What is the direct result of ${l}?`,
  "process":           (l) => `What is the correct sequence of steps in ${l}?`,
  "mechanism":         (l) => `Which best explains the mechanism by which ${l} occurs?`,
  "indication":        (l) => `Which condition is an indication for ${l}?`,
  "contraindication":  (l) => `In which scenario is ${l} contraindicated?`,
  "warning":           (l) => `Which of the following is a known warning regarding ${l}?`,
  "high-yield":        (l) => `Which of the following is the most important fact about ${l}?`,
  "clinical-pearl":    (l) => `Regarding ${l}, which clinical pearl is most relevant?`,
  "formula":           (l) => `Which formula correctly represents ${l}?`,
  "worked-example":    (l) => `When solving a problem involving ${l}, what is the first step?`,
  "treatment":         (l) => `Which of the following describes the treatment approach for ${l}?`,
  "complication":      (l) => `Which complication is most associated with ${l}?`,
  "classification":    (l) => `How is ${l} best classified?`,
  "evidence":          (l) => `Which evidence most strongly supports ${l}?`,
  "memory-anchor":     (l) => `Which mnemonic or memory device is associated with ${l}?`,
  "decision-point":    (l) => `At the decision point for ${l}, the key criterion is:`,
  "relationship":      (l) => `How does ${l} relate to the surrounding concepts?`,
  "exception":         (l) => `Which situation represents an exception to ${l}?`,
  "common-error":      (l) => `Which of the following is a common error when applying ${l}?`,
};

/** Fallback templates keyed by DatUnitType. */
const DAT_UNIT_TYPE_STEM: Record<DatUnitType, (label: string) => string> = {
  "definition":          (l) => `Which of the following best defines ${l}?`,
  "mechanism":           (l) => `Which best explains the mechanism of ${l}?`,
  "clinical_application":(l) => `In a clinical context, ${l} is most relevant when:`,
  "formula":             (l) => `Which formula correctly represents ${l}?`,
  "example":             (l) => `Given an example of ${l}, what is the expected outcome?`,
  "contrast":            (l) => `How does ${l} differ from a similar concept?`,
  "fact":                (l) => `Which of the following is true regarding ${l}?`,
  "unknown":             (l) => `Which of the following best applies to ${l}?`,
};

/** Extract a short label from the unit for use in the question stem. */
function extractLabel(unit: CanonicalThoughtUnit): string {
  // Use a title-like leading phrase (up to first comma, period, colon, or 50 chars)
  const match = unit.text.match(/^([^.,;:!?\n]{4,50})/);
  return (match?.[1] ?? unit.text.slice(0, 50)).trim().replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// buildQuestionStem
// ---------------------------------------------------------------------------

/**
 * Generate a question stem for a canonical unit.
 *
 * Priority: canonicalType template → datUnitType fallback → generic stem.
 */
export function buildQuestionStem(unit: CanonicalThoughtUnit): string {
  const label = extractLabel(unit);
  if (unit.canonicalType && CANONICAL_STEM[unit.canonicalType]) {
    return CANONICAL_STEM[unit.canonicalType]!(label);
  }
  return DAT_UNIT_TYPE_STEM[unit.datUnitType]?.(label)
    ?? `Which of the following best applies to ${label}?`;
}

// ---------------------------------------------------------------------------
// buildDatQuestionStub
// ---------------------------------------------------------------------------

/**
 * Convert a single CanonicalThoughtUnit into a DatQuestionStub.
 * The unit's ReaderAnchor is copied verbatim so callers can link directly
 * back to the source passage without any extra IDB lookup.
 */
export function buildDatQuestionStub(
  unit: CanonicalThoughtUnit,
  opts: { sourceBookId?: string } = {},
): DatQuestionStub {
  const questionStem = buildQuestionStem(unit);

  const suggestedType: DatQuestionStub["suggestedType"] =
    unit.canonicalType === "formula" || unit.canonicalType === "worked-example"
      ? "short-answer"
      : "multiple-choice";

  return {
    canonicalUnitId: unit.id,
    sourceAnchor:    { ...unit.anchor }, // copy — stubs are immutable snapshots
    sourceBookId:    opts.sourceBookId ?? unit.documentId,

    datSection:      unit.datSection,
    datTopic:        unit.datTopic,
    datUnitType:     unit.datUnitType,
    datRelevance:    unit.datRelevance,

    questionStem,
    canonicalType:   unit.canonicalType,
    difficulty:      unit.difficulty,
    suggestedType,
  };
}

// ---------------------------------------------------------------------------
// canonicalUnitsToDatStubs
// ---------------------------------------------------------------------------

export interface CanonicalToStubsOpts {
  /** Only include units with datRelevance ≥ this value. Default: 0.3 */
  minRelevance?: number;
  /** Cap on returned stubs. Default: 20 */
  maxStubs?: number;
  /** Restrict to a specific DAT section. Default: all sections. */
  datSection?: DatSection;
  /** Book id to stamp on each stub. */
  sourceBookId?: string;
}

/**
 * Batch-convert canonical thought units into DAT question stubs.
 *
 * Stubs are:
 *   1. Filtered to units with datRelevance ≥ minRelevance (default 0.3)
 *   2. Optionally restricted to a specific datSection
 *   3. Sorted by datRelevance descending (highest-relevance first)
 *   4. Capped at maxStubs (default 20)
 *
 * Units with datSection "none" are excluded — they carry no DAT signal.
 */
export function canonicalUnitsToDatStubs(
  units: CanonicalThoughtUnit[],
  opts: CanonicalToStubsOpts = {},
): DatQuestionStub[] {
  const {
    minRelevance = 0.3,
    maxStubs     = 20,
    datSection,
    sourceBookId,
  } = opts;

  return units
    .filter((u) => u.datSection !== "none")
    .filter((u) => u.datRelevance >= minRelevance)
    .filter((u) => !datSection || u.datSection === datSection)
    .sort((a, b) => b.datRelevance - a.datRelevance)
    .slice(0, maxStubs)
    .map((u) => buildDatQuestionStub(u, { sourceBookId }));
}

// ---------------------------------------------------------------------------
// groupStubsBySection
// ---------------------------------------------------------------------------

/**
 * Group stubs by DAT section — useful for section-by-section review panels.
 * Returns a Map so iteration order is insertion order of first occurrence.
 */
export function groupStubsBySection(
  stubs: DatQuestionStub[],
): Map<DatSection, DatQuestionStub[]> {
  const groups = new Map<DatSection, DatQuestionStub[]>();
  for (const stub of stubs) {
    const arr = groups.get(stub.datSection) ?? [];
    arr.push(stub);
    groups.set(stub.datSection, arr);
  }
  return groups;
}
