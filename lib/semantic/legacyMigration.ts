// lib/semantic/legacyMigration.ts
// Migration adapters: map legacy SemanticLabel + ParagraphKind values to
// CanonicalSemanticType so that old saved CanonicalThoughtUnits continue
// to display correctly after the semantic pack engine is introduced.
//
// No runtime dependency on the rendering pipeline — import freely from
// both client and server code.

import type { CanonicalSemanticType } from "./types";
import type { SemanticLabel } from "../canonical/types";
import type { ParagraphKind } from "../readerContracts";

// ── Legacy SemanticLabel → CanonicalSemanticType ─────────────────────────────

const SEMANTIC_LABEL_MAP: Record<SemanticLabel, CanonicalSemanticType> = {
  "master":         "core-concept",
  "definition":     "definition",
  "procedure":      "process",
  "mechanism":      "mechanism",
  "formula":        "formula",
  "worked-example": "worked-example",
  "exception":      "exception",
  "common-error":   "common-error",
  "clinical-pearl": "clinical-pearl",
  "dat-tip":        "high-yield",
};

export function migrateSemanticLabel(label: SemanticLabel): CanonicalSemanticType {
  return SEMANTIC_LABEL_MAP[label];
}

// ── ParagraphKind → CanonicalSemanticType (rendering pipeline bridge) ────────

const PARAGRAPH_KIND_MAP: Record<ParagraphKind, CanonicalSemanticType | null> = {
  thesis:       "core-concept",
  mechanism:    "mechanism",
  application:  "worked-example",
  trap:         "common-error",
  memoryAnchor: "memory-anchor",
  definition:   "definition",
  clinical:     "clinical-pearl",
  comparison:   "relationship",
  formula:      "formula",
  keyDetail:    "core-concept",
  keyAnatomy:   "classification",
  dat_fact:     "high-yield",
  reference:    null,
  filler:       null,
  unknown:      null,
};

export function canonicalTypeFromKind(kind: ParagraphKind): CanonicalSemanticType | null {
  return PARAGRAPH_KIND_MAP[kind];
}

// ── CanonicalSemanticType → ParagraphKind (backward bridge for renderers) ────
// Used so that existing KIND_COLORS and tierGlyph() work with new types.

const CANONICAL_TO_KIND: Record<CanonicalSemanticType, ParagraphKind> = {
  "definition":       "definition",
  "core-concept":     "thesis",
  "process":          "mechanism",
  "mechanism":        "mechanism",
  "relationship":     "comparison",
  "classification":   "keyAnatomy",
  "formula":          "formula",
  "worked-example":   "application",
  "indication":       "clinical",
  "contraindication": "trap",
  "decision-point":   "application",
  "exception":        "trap",
  "warning":          "trap",
  "common-error":     "trap",
  "material":         "keyDetail",
  "finding":          "keyDetail",
  "treatment":        "mechanism",
  "complication":     "trap",
  "clinical-pearl":   "clinical",
  "high-yield":       "dat_fact",
  "memory-anchor":    "memoryAnchor",
  "evidence":         "keyDetail",
  "cause":            "mechanism",
  "effect":           "application",
};

export function kindFromCanonicalType(type: CanonicalSemanticType): ParagraphKind {
  return CANONICAL_TO_KIND[type];
}
