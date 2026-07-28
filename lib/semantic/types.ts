// lib/semantic/types.ts
// Core types for the adaptive semantic pack engine.
//
// Two-layer architecture:
//   Layer 1 (Universal)    — structural concepts valid for any textbook
//   Layer 2 (Subject Pack) — domain-specific specialisations of Layer 1
//
// Resolution order: user chapter override → detected chapter pack
//                 → user document override → detected document pack
//                 → general (fallback)

export const CLASSIFIER_VERSION = 1;

// ── Semantic domain ──────────────────────────────────────────────────────────

export type SemanticDomain =
  | "dentistry"
  | "medicine"
  | "biology"
  | "general-chemistry"
  | "organic-chemistry"
  | "physics"
  | "anatomy"
  | "law"
  | "history"
  | "finance"
  | "computer-science"
  | "general"
  | "fiction";

// ── Canonical semantic type ──────────────────────────────────────────────────
// 23 universal types — subject packs map these to domain display language.

export type CanonicalSemanticType =
  | "definition"
  | "core-concept"
  | "process"
  | "mechanism"
  | "relationship"
  | "classification"
  | "formula"
  | "worked-example"
  | "indication"
  | "contraindication"
  | "decision-point"
  | "exception"
  | "warning"
  | "common-error"
  | "material"
  | "finding"
  | "treatment"
  | "complication"
  | "clinical-pearl"
  | "high-yield"
  | "memory-anchor"
  | "evidence"
  | "cause"
  | "effect";

export const ALL_CANONICAL_TYPES: CanonicalSemanticType[] = [
  "definition", "core-concept", "process", "mechanism", "relationship",
  "classification", "formula", "worked-example", "indication", "contraindication",
  "decision-point", "exception", "warning", "common-error", "material",
  "finding", "treatment", "complication", "clinical-pearl", "high-yield",
  "memory-anchor", "evidence", "cause", "effect",
];

// ── Pack building blocks ─────────────────────────────────────────────────────

export interface RankingRule {
  canonicalType: CanonicalSemanticType;
  /** Multiplier applied to the unit's base priority score. */
  boostFactor: number;
  reason?: string;
}

export interface SemanticLabelDefinition {
  /** Unique within a pack. Format: "${domain}:${slug}" */
  id: string;
  canonicalType: CanonicalSemanticType;
  /** Full display string shown in the left panel. */
  label: string;
  /** Compact form for tight UI contexts. */
  shortLabel: string;
  /** Single emoji — must read clearly in light, dark, and dyslexia modes. */
  icon: string;
  /** 1 = highest — determines left-panel sort order. */
  priority: number;
  /** Cap on cards of this type per page. Undefined = uncapped. */
  maxPerPage?: number;
  /** Whether the source text span must be exact (not synthesised). */
  requiresExactSourceSpan: boolean;
  /** Whether this label may appear on a page-synthesis card (teaching layer). */
  allowPageSynthesis: boolean;
  examples?: string[];
}

export interface SemanticPack {
  id: SemanticDomain | "universal";
  label: string;
  labels: SemanticLabelDefinition[];
  promptInstructions: string[];
  rankingRules: RankingRule[];
  /** Minimum domain confidence (0–1) needed to activate this pack. */
  minimumConfidence: number;
  fallbackPackId: "general";
}

// ── Domain assignment ────────────────────────────────────────────────────────

export interface SemanticDomainAssignment {
  documentId: string;
  /** Undefined = document-level assignment. */
  chapterId?: string;
  pageStart?: number;
  pageEnd?: number;
  domain: SemanticDomain;
  /** 0–1 confidence from the classifier; 1 for user overrides. */
  confidence: number;
  source: "classifier" | "user";
  evidence?: string[];
  classifierVersion: number;
  updatedAt: number;
}

// ── Classifier output ────────────────────────────────────────────────────────

export interface ClassificationResult {
  domain: SemanticDomain;
  confidence: number;
  evidence: string[];
  classifierVersion: typeof CLASSIFIER_VERSION;
}

// ── Confidence thresholds ────────────────────────────────────────────────────

export const CONFIDENCE = {
  /** Auto-apply subject pack. */
  HIGH: 0.80,
  /** Universal + tentative subject labels. */
  TENTATIVE: 0.55,
  /** Minimum score for a domain switch. */
  SWITCH_MIN: 0.75,
  /** Required margin over current domain confidence. */
  SWITCH_MARGIN: 0.15,
  /** Minimum supporting substantive units for a domain switch. */
  SWITCH_MIN_UNITS: 3,
} as const;
