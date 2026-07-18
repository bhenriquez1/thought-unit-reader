// lib/bookIntelligence/types.ts
// Canonical data model for document understanding.
//
// Two distinct questions, two distinct layers:
//   BookClassification  — What is this document?
//   LearningCharacteristics — How should it be learned?
//
// These are kept separate because the answers come from different signals
// and drive different downstream systems. Classification drives reasoning
// strategy selection and syllabus structure. Learning characteristics drive
// Whiteboard style, Recall frequency, AI Coach recommendations, and pacing.
//
// BookIntelligence is computed once per documentId, stored in IDB, and
// consumed by all downstream panels. No module should independently
// re-classify a document or generate a conflicting structure.

/* ─── Primitives ──────────────────────────────────────────────────────────── */

export type InstructionalStyle =
  | "textbook"
  | "reference"
  | "review"
  | "manual"
  | "lecture-notes"
  | "research"
  | "narrative"
  | "mixed";

export type BookComplexity =
  | "introductory"
  | "intermediate"
  | "advanced"
  | "expert";

/**
 * Named domains the classifier can return.
 * Free-form strings are allowed (multidisciplinary, unknown) but canonical
 * values enable downstream reasoning-strategy lookup.
 */
export type Domain =
  | "medicine"
  | "dentistry"
  | "nursing"
  | "pharmacy"
  | "veterinary"
  | "biology"
  | "chemistry"
  | "organic-chemistry"
  | "biochemistry"
  | "physics"
  | "mathematics"
  | "statistics"
  | "engineering"
  | "computer-science"
  | "data-science"
  | "architecture"
  | "law"
  | "business"
  | "economics"
  | "finance"
  | "accounting"
  | "psychology"
  | "sociology"
  | "history"
  | "political-science"
  | "philosophy"
  | "literature"
  | "linguistics"
  | "language-learning"
  | "art-history"
  | "education"
  | "multidisciplinary"
  | "unknown"
  | string; // allow free-form when evidence is ambiguous

export type DocumentType =
  | "textbook"
  | "atlas"
  | "board-review"
  | "certification-manual"
  | "lecture-notes"
  | "lab-manual"
  | "research-paper"
  | "technical-documentation"
  | "standards-specification"
  | "user-manual"
  | "novel"
  | "religious-text"
  | "government-publication"
  | "mixed"
  | "unknown";

/* ─── Layer 1 — Classification (What is this document?) ──────────────────── */

export type ClassificationEvidence = {
  signal: "title-page" | "preface" | "toc" | "chapter-titles" | "headings" |
          "terminology" | "figure-captions" | "tables" | "review-questions" |
          "glossary" | "bibliography" | "metadata" | "thought-units" |
          "canonical-anchors" | "page-sample";
  excerpt: string;
  weight: number; // 0–1
};

export type BookClassification = {
  primaryDomain: Domain;
  secondaryDomains: Domain[];
  documentType: DocumentType;
  instructionalStyle: InstructionalStyle;
  /** 0–1 overall classifier confidence */
  confidence: number;
  evidence: ClassificationEvidence[];
};

/* ─── Layer 2 — Learning Characteristics (How should it be learned?) ─────── */

/**
 * Each field is a 0–1 score, not a boolean, so downstream systems can
 * weight them continuously rather than branching on thresholds.
 * 0 = not present, 1 = dominant characteristic.
 */
export type LearningCharacteristics = {
  prerequisiteHeavy: number;   // concepts build strictly on prior concepts
  conceptDense: number;        // high ratio of distinct ideas per page
  procedureHeavy: number;      // step-by-step processes dominate
  calculationHeavy: number;    // quantitative problem-solving required
  memorizationHeavy: number;   // recall of discrete facts/terminology
  caseBased: number;           // learning via cases, scenarios, or examples
  visualHeavy: number;         // figures, diagrams, atlases dominate
  discussionHeavy: number;     // argument, interpretation, analysis dominate
};

/* ─── Reasoning Strategy (domain-driven, not profile-driven) ─────────────── */

/**
 * The expert reasoning framework appropriate for this document's domain.
 * Selected automatically from BookClassification — never manually toggled.
 * Injected into AI routes alongside the Learning Profile block.
 */
export type ReasoningStrategy = {
  id: string;
  label: string;
  /** Injected into system prompts as a reasoning framing block */
  systemBlock: string;
};

/* ─── Combined BookIntelligence ───────────────────────────────────────────── */

export type BookIntelligence = {
  /** Matches the document's IDB key */
  documentId: string;
  classification: BookClassification;
  learningCharacteristics: LearningCharacteristics;
  complexity: BookComplexity;
  /** 0–1 confidence in the complexity judgment */
  complexityConfidence: number;
  reasoningStrategy: ReasoningStrategy;
  /** Unix ms timestamp of last computation */
  computedAt: number;
  /** Increment when the schema changes to trigger re-classification */
  version: number;
};

/* ─── Syllabus node (forward reference for PR B) ─────────────────────────── */

export type SyllabusNode = {
  id: string;
  title: string;
  nodeType:
    | "part" | "chapter" | "section" | "subsection"
    | "concept" | "definition" | "principle" | "procedure"
    | "mechanism" | "example" | "figure" | "table"
    | "equation" | "case-study" | "exercise" | "review-question"
    | "appendix" | "glossary" | "reference";
  parentId?: string;
  pageStart?: number;
  pageEnd?: number;
  canonicalAnchorIds: string[];
  knowledgeNodeIds: string[];
  /** 0–1 confidence that this node is correctly extracted from the source */
  sourceConfidence: number;
  /** true = inferred from content; false = present verbatim in source */
  inferred: boolean;
};

export type AdaptiveSyllabusMetadata = {
  importance: number;           // 0–1
  difficulty: number;           // 0–1
  estimatedMinutes: number;
  reviewIntervalDays: number;
  prerequisiteIds: string[];
  confidence: number;           // 0–1
  mastery?: number;             // 0–1, populated from learner history
  /** Human-readable explanation of how these values were derived */
  rationale: string[];
};

export const BOOK_INTELLIGENCE_VERSION = 1;
