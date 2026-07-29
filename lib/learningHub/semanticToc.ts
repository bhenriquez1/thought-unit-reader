// lib/learningHub/semanticToc.ts
// Semantic Table of Contents — groups canonical units by concept type rather
// than by page/chapter position.
//
// Output: SemanticTocChapter[] where each chapter holds named sections such as
//   "Definitions", "Mechanisms", "Clinical Pearls", "Warnings", "Formulas"…
//
// When chapter boundaries (pageStart values) are provided, units are assigned
// to chapters by pageNumber. Otherwise all units go into a single chapter.
// Within each chapter, sections appear in a fixed pedagogical order and units
// within each section are sorted by importance (critical first).

import { resolveImportanceLevel } from "@/lib/reader/importanceBadge";
import type { ConceptUnit } from "./conceptLearningPlan";

// ---------------------------------------------------------------------------
// Section group metadata
// ---------------------------------------------------------------------------

interface SectionGroupMeta {
  label: string;
  icon: string;
  types: string[];
  order: number;
}

const SECTION_GROUPS: SectionGroupMeta[] = [
  { label: "Definitions",      icon: "📖", types: ["definition", "core-concept", "classification"],                           order: 0 },
  { label: "Mechanisms",       icon: "⚙️", types: ["mechanism", "process", "sequence"],                                       order: 1 },
  { label: "Causes & Effects", icon: "↩️", types: ["cause", "effect", "relationship"],                                        order: 2 },
  { label: "Clinical Pearls",  icon: "💎", types: ["clinical-pearl", "indication", "treatment", "decision-point"],            order: 3 },
  { label: "High-Yield Facts", icon: "⭐", types: ["high-yield", "evidence"],                                                 order: 4 },
  { label: "Warnings",         icon: "⚠️", types: ["warning", "contraindication", "exception", "complication", "common-error"], order: 5 },
  { label: "Formulas",         icon: "📐", types: ["formula", "worked-example"],                                              order: 6 },
  { label: "Memory Hooks",     icon: "🧠", types: ["memory-anchor"],                                                          order: 7 },
];

const TYPE_TO_GROUP = new Map<string, SectionGroupMeta>();
for (const grp of SECTION_GROUPS) {
  for (const t of grp.types) TYPE_TO_GROUP.set(t, grp);
}

const FALLBACK_GROUP: SectionGroupMeta = {
  label: "Key Points", icon: "📌", types: [], order: 99,
};

const IMPORTANCE_RANK: Record<string, number> = {
  critical: 0, high: 1, medium: 2, reference: 3,
};

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface TocUnit {
  id: string;
  text: string;
  title?: string;
  canonicalType: string;
  importanceScore?: number;
  priorityTier?: number;
  pageNumber?: number;
}

export interface SemanticTocSection {
  canonicalTypeGroup: string;
  label: string;
  icon: string;
  units: TocUnit[];
}

export interface SemanticTocChapter {
  title: string;
  pageStart?: number;
  sections: SemanticTocSection[];
  unitCount: number;
}

// ---------------------------------------------------------------------------
// buildSemanticToc
// ---------------------------------------------------------------------------

/**
 * Build a semantic TOC from canonical units, grouped by concept type cluster.
 *
 * Chapter assignment (when chapters are provided):
 *   A unit belongs to the chapter whose pageStart is the largest value ≤ the
 *   unit's pageNumber. Units without a pageNumber, or whose page precedes all
 *   chapter starts, are collected into a "General" overflow chapter.
 *
 * Section ordering within each chapter:
 *   Definitions → Mechanisms → Causes & Effects → Clinical Pearls →
 *   High-Yield Facts → Warnings → Formulas → Memory Hooks → Key Points
 *
 * Unit ordering within each section: critical → high → medium → reference.
 */
export function buildSemanticToc(
  units: ConceptUnit[],
  chapters: Array<{ title: string; pageStart: number }> = [],
): SemanticTocChapter[] {
  if (units.length === 0) return [];

  const sorted = [...chapters].sort((a, b) => a.pageStart - b.pageStart);

  if (sorted.length === 0) {
    const chapter = buildChapter("All Content", undefined, units);
    return chapter.sections.length > 0 ? [chapter] : [];
  }

  const buckets = new Map<string, ConceptUnit[]>();
  for (const unit of units) {
    const key = assignChapterKey(unit.pageNumber, sorted);
    const arr = buckets.get(key) ?? [];
    arr.push(unit);
    buckets.set(key, arr);
  }

  const result: SemanticTocChapter[] = [];
  for (const ch of sorted) {
    const bucket = buckets.get(ch.title) ?? [];
    if (bucket.length === 0) continue;
    result.push(buildChapter(ch.title, ch.pageStart, bucket));
  }

  const overflow = buckets.get("__overflow__") ?? [];
  if (overflow.length > 0) {
    result.push(buildChapter("General", undefined, overflow));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assignChapterKey(
  pageNumber: number | undefined,
  chapters: Array<{ title: string; pageStart: number }>,
): string {
  if (pageNumber == null) return "__overflow__";
  let best = "__overflow__";
  for (const ch of chapters) {
    if (pageNumber >= ch.pageStart) best = ch.title;
    else break;
  }
  return best;
}

function buildChapter(
  title: string,
  pageStart: number | undefined,
  units: ConceptUnit[],
): SemanticTocChapter {
  const groupMap = new Map<string, { meta: SectionGroupMeta; units: TocUnit[] }>();

  for (const unit of units) {
    const ct  = unit.canonicalType ?? "";
    const grp = TYPE_TO_GROUP.get(ct) ?? FALLBACK_GROUP;
    if (!groupMap.has(grp.label)) groupMap.set(grp.label, { meta: grp, units: [] });
    groupMap.get(grp.label)!.units.push({
      id:             unit.id,
      text:           unit.text,
      title:          unit.title,
      canonicalType:  ct || "key-point",
      importanceScore: unit.importanceScore,
      priorityTier:   unit.priorityTier,
      pageNumber:     unit.pageNumber,
    });
  }

  for (const entry of groupMap.values()) {
    entry.units.sort((a, b) => {
      const la = resolveImportanceLevel(a.importanceScore, a.priorityTier);
      const lb = resolveImportanceLevel(b.importanceScore, b.priorityTier);
      return (IMPORTANCE_RANK[la] ?? 3) - (IMPORTANCE_RANK[lb] ?? 3);
    });
  }

  const sections: SemanticTocSection[] = Array.from(groupMap.values())
    .sort((a, b) => a.meta.order - b.meta.order)
    .map(({ meta, units: u }) => ({
      canonicalTypeGroup: meta.label,
      label: meta.label,
      icon:  meta.icon,
      units: u,
    }));

  return { title, pageStart, sections, unitCount: units.length };
}
