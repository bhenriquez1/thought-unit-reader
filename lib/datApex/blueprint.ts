// lib/datApex/blueprint.ts
// Versioned DAT exam blueprint — the single canonical source for section item
// counts, timing, break placement, scoring model version, and topic weights.
//
// All exam-construction code must read from an active DatExamBlueprint rather
// than using scattered constants. Bump the version when the ADA publishes
// updated specifications (e.g. Organic Chemistry changes for 2026).

export const DAT_APEX_VERSION = "1.0.0";

/* ─── Section identifiers ─────────────────────────────────────────────────── */

/** Canonical sub-section IDs matching ADA content area labels */
export type DatSectionId =
  | "biology"
  | "general-chemistry"
  | "organic-chemistry"
  | "perceptual-ability"
  | "reading-comprehension"
  | "quantitative-reasoning";

/**
 * Section families as administered.
 * Natural Sciences is one timed block containing three sub-sections;
 * the other families have a single sub-section each.
 */
export type DatSectionFamily =
  | "natural-sciences"
  | "perceptual-ability"
  | "reading-comprehension"
  | "quantitative-reasoning";

/* ─── Blueprint component types ───────────────────────────────────────────── */

export type DatTopicWeight = {
  topicId: string;
  /** Target percentage of items from this topic (0–100) */
  targetPct: number;
  /** Permitted ± variance around targetPct */
  tolerancePct: number;
};

export type DatSubSectionBlueprint = {
  id: DatSectionId;
  label: string;
  itemCount: number;
  /** ADA content specification version this sub-section reflects */
  specificationVersion: string;
  topicWeights: DatTopicWeight[];
};

export type DatBreakBlueprint = {
  /** The section family after which this break is scheduled */
  afterSectionFamily: DatSectionFamily;
  durationMinutes: number;
  /** Examinees may choose to skip in practice modes; never skip in strict simulation */
  optional: boolean;
};

export type DatSectionBlueprint = {
  family: DatSectionFamily;
  label: string;
  subSections: DatSubSectionBlueprint[];
  /** Total items across all subSections */
  totalItemCount: number;
  /** Cumulative time limit for all subSections in this family */
  timeLimitMinutes: number;
};

export type DatExamBlueprint = {
  /** Semantic version (e.g. "2025.1") — increment when ADA changes specs */
  version: string;
  /** ISO date when this blueprint became effective */
  effectiveDate: string;
  /** ADA scoring model version (e.g. "ada-2025") */
  scoringModelVersion: string;
  sourceReference: string;
  /** Section families in administration order */
  sectionFamilyOrder: DatSectionFamily[];
  sections: DatSectionBlueprint[];
  breaks: DatBreakBlueprint[];
  tutorialMinutes: number;
  /** Official total administration time including tutorial, testing, and all breaks */
  totalAdministrationMinutes: number;
  /** Notes about known upcoming specification changes */
  upcomingChanges?: string[];
};

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

/** Return the DatSectionBlueprint for a given family, or null */
export function getSectionBlueprint(
  blueprint: DatExamBlueprint,
  family: DatSectionFamily,
): DatSectionBlueprint | null {
  return blueprint.sections.find(s => s.family === family) ?? null;
}

/** Return the sub-section blueprint for a given DatSectionId, or null */
export function getSubSectionBlueprint(
  blueprint: DatExamBlueprint,
  sectionId: DatSectionId,
): DatSubSectionBlueprint | null {
  for (const section of blueprint.sections) {
    const found = section.subSections.find(ss => ss.id === sectionId);
    if (found) return found;
  }
  return null;
}

/** Total item count across all sections */
export function totalBlueprintItems(blueprint: DatExamBlueprint): number {
  return blueprint.sections.reduce((sum, s) => sum + s.totalItemCount, 0);
}

/** Total testing minutes (excludes tutorial; includes scheduled breaks) */
export function totalTestingMinutes(blueprint: DatExamBlueprint): number {
  const sectionTime = blueprint.sections.reduce((sum, s) => sum + s.timeLimitMinutes, 0);
  const breakTime   = blueprint.breaks.reduce((sum, b) => sum + b.durationMinutes, 0);
  return sectionTime + breakTime;
}
