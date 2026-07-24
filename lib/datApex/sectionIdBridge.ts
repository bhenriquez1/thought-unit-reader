// lib/datApex/sectionIdBridge.ts
// Single source of truth for mapping between the three section ID formats
// that exist in the codebase:
//
//  canonical DatSection  (lib/canonical/types.ts)  — underscore, e.g. "general_chemistry"
//  blueprint DatSectionId (lib/datApex/blueprint.ts) — hyphen,     e.g. "general-chemistry"
//  legacy short IDs       (lib/apex/datApexTypes.ts) — 2–3 chars,  e.g. "gc"
//
// Always go through this bridge — never do string replacement inline.

import type { DatSection } from "@/lib/canonical/types";
import type { DatSectionId } from "@/lib/datApex/blueprint";

/* ─── canonical DatSection → blueprint DatSectionId ────────────────────────── */

const CANONICAL_TO_BLUEPRINT: Record<DatSection, DatSectionId | null> = {
  biology:               "biology",
  general_chemistry:     "general-chemistry",
  organic_chemistry:     "organic-chemistry",
  perceptual_ability:    "perceptual-ability",
  reading_comprehension: "reading-comprehension",
  quantitative_reasoning:"quantitative-reasoning",
  none:                  null,
};

export function blueprintSectionId(section: DatSection): DatSectionId | null {
  return CANONICAL_TO_BLUEPRINT[section];
}

/* ─── blueprint DatSectionId → canonical DatSection ────────────────────────── */

const BLUEPRINT_TO_CANONICAL: Partial<Record<DatSectionId, DatSection>> = {
  "biology":               "biology",
  "general-chemistry":     "general_chemistry",
  "organic-chemistry":     "organic_chemistry",
  "perceptual-ability":    "perceptual_ability",
  "reading-comprehension": "reading_comprehension",
  "quantitative-reasoning":"quantitative_reasoning",
};

export function canonicalSection(sectionId: DatSectionId): DatSection {
  return BLUEPRINT_TO_CANONICAL[sectionId] ?? "none";
}

/* ─── legacy short IDs ←→ blueprint DatSectionId ───────────────────────────── */

export type ShortSectionId = "bio" | "gc" | "orgo" | "pat" | "rc" | "qr";

const SHORT_TO_BLUEPRINT: Record<ShortSectionId, DatSectionId> = {
  bio:   "biology",
  gc:    "general-chemistry",
  orgo:  "organic-chemistry",
  pat:   "perceptual-ability",
  rc:    "reading-comprehension",
  qr:    "quantitative-reasoning",
};

const BLUEPRINT_TO_SHORT: Partial<Record<DatSectionId, ShortSectionId>> = {
  "biology":               "bio",
  "general-chemistry":     "gc",
  "organic-chemistry":     "orgo",
  "perceptual-ability":    "pat",
  "reading-comprehension": "rc",
  "quantitative-reasoning":"qr",
};

export function blueprintFromShort(short: ShortSectionId): DatSectionId {
  return SHORT_TO_BLUEPRINT[short];
}

export function shortFromBlueprint(sectionId: DatSectionId): ShortSectionId | null {
  return BLUEPRINT_TO_SHORT[sectionId] ?? null;
}

export function shortFromCanonical(section: DatSection): ShortSectionId | null {
  const bp = blueprintSectionId(section);
  return bp ? shortFromBlueprint(bp) : null;
}

/* ─── Proctor section IDs (parent family groupings used in GeneratedExam) ─── */
// The proctor groups bio+gc+orgo under "survey-natural-sciences".
// These are NOT DatSectionIds — they are DisplaySectionIds from the exam engine.

export type DisplaySectionId =
  | "survey-natural-sciences"
  | "perceptual-ability"
  | "reading-comprehension"
  | "quantitative-reasoning"
  | "biology"
  | "general-chemistry"
  | "organic-chemistry";

/** Map any known string format to blueprint DatSectionId. Returns null if unknown. */
export function normalizeSectionId(raw: string): DatSectionId | null {
  // Already a blueprint ID
  if (BLUEPRINT_TO_CANONICAL[raw as DatSectionId]) return raw as DatSectionId;
  // Short ID
  if (SHORT_TO_BLUEPRINT[raw as ShortSectionId]) return SHORT_TO_BLUEPRINT[raw as ShortSectionId];
  // Canonical underscore
  const bp = CANONICAL_TO_BLUEPRINT[raw as DatSection];
  if (bp) return bp;
  return null;
}
