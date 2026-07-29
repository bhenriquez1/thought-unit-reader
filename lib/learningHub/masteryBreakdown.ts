// lib/learningHub/masteryBreakdown.ts
// Concept-level mastery breakdown for the Learning Hub.
//
// Calculates per-canonical-type and overall mastery from canonical units and
// recall history. Results feed:
//   - The "Weak Areas" panel (types where pct < 40%)
//   - The "Mastery" overview card (types where pct >= 80%)
//   - The Knowledge Graph node colours (pct → colour tier)
//
// A unit is "mastered" when its RecallItem has streak ≥ 3 AND correct === true.
// Units with no RecallItem are unattempted — not mastered.

import type { ImportanceLevel } from "@/lib/reader/importanceBadge";
import { resolveImportanceLevel } from "@/lib/reader/importanceBadge";
import type { ConceptUnit, RecallItem } from "./conceptLearningPlan";

// ---------------------------------------------------------------------------
// Type display metadata
// ---------------------------------------------------------------------------

interface TypeDisplayMeta {
  label: string;
  icon: string;
}

const TYPE_DISPLAY: Partial<Record<string, TypeDisplayMeta>> = {
  "definition":       { label: "Definitions",      icon: "📖" },
  "core-concept":     { label: "Core Concepts",     icon: "🎯" },
  "cause":            { label: "Causes",            icon: "↩️" },
  "effect":           { label: "Effects",           icon: "↪️" },
  "process":          { label: "Processes",         icon: "📋" },
  "mechanism":        { label: "Mechanisms",        icon: "⚙️" },
  "relationship":     { label: "Relationships",     icon: "🔗" },
  "evidence":         { label: "Evidence",          icon: "📊" },
  "classification":   { label: "Classifications",   icon: "🗂️" },
  "indication":       { label: "Indications",       icon: "✅" },
  "treatment":        { label: "Treatments",        icon: "💊" },
  "clinical-pearl":   { label: "Clinical Pearls",   icon: "💎" },
  "worked-example":   { label: "Worked Examples",   icon: "🧮" },
  "decision-point":   { label: "Decision Points",   icon: "🌳" },
  "warning":          { label: "Warnings",          icon: "⚠️" },
  "contraindication": { label: "Contraindications", icon: "🚫" },
  "high-yield":       { label: "High-Yield Facts",  icon: "⭐" },
  "exception":        { label: "Exceptions",        icon: "⚡" },
  "common-error":     { label: "Common Errors",     icon: "❌" },
  "memory-anchor":    { label: "Memory Hooks",      icon: "🧠" },
  "formula":          { label: "Formulas",          icon: "📐" },
  "complication":     { label: "Complications",     icon: "🚧" },
};

const DEFAULT_DISPLAY: TypeDisplayMeta = { label: "Key Points", icon: "📌" };

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface TypeMastery {
  canonicalType: string;
  label: string;
  icon: string;
  total: number;
  mastered: number;
  /** 0–100 percentage, rounded */
  pct: number;
  /** Most common (or highest) importance level among units of this type */
  dominantImportance: ImportanceLevel;
}

export interface ConceptMasteryBreakdown {
  byType: Record<string, TypeMastery>;
  /** 0–100 percentage, rounded */
  overallPct: number;
  totalUnits: number;
  masteredUnits: number;
  /** Canonical types where pct < 40 — surface in Weak Areas panel, worst first */
  weakTypes: string[];
  /** Canonical types where pct >= 80 — badge as Mastered, best first */
  strongTypes: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MASTERY_STREAK = 3;
const WEAK_THRESHOLD   = 40;
const STRONG_THRESHOLD = 80;

const IMPORTANCE_RANK: Record<ImportanceLevel, number> = {
  critical: 0, high: 1, medium: 2, reference: 3,
};

// ---------------------------------------------------------------------------
// buildMasteryBreakdown
// ---------------------------------------------------------------------------

/**
 * Calculate concept-level mastery from canonical units and their recall
 * history.
 *
 * Mastery condition: recall.streak ≥ 3 AND recall.correct === true.
 * Units with no RecallItem are unattempted (not mastered).
 */
export function buildMasteryBreakdown(
  units: ConceptUnit[],
  recallItems: RecallItem[],
): ConceptMasteryBreakdown {
  const byUnitId = new Map<string, RecallItem>(recallItems.map((r) => [r.unitId, r]));

  type Bucket = { total: number; mastered: number; levels: ImportanceLevel[] };
  const typeMap = new Map<string, Bucket>();

  let totalMastered = 0;

  for (const unit of units) {
    const ct = unit.canonicalType ?? "key-point";
    if (!typeMap.has(ct)) typeMap.set(ct, { total: 0, mastered: 0, levels: [] });
    const bucket = typeMap.get(ct)!;
    bucket.total += 1;

    const recall   = byUnitId.get(unit.id);
    const mastered = !!recall && recall.streak >= MASTERY_STREAK && recall.correct;
    if (mastered) {
      bucket.mastered += 1;
      totalMastered   += 1;
    }

    bucket.levels.push(resolveImportanceLevel(unit.importanceScore, unit.priorityTier));
  }

  const byType: Record<string, TypeMastery> = {};
  const weakTypes: string[]   = [];
  const strongTypes: string[] = [];

  for (const [ct, { total, mastered, levels }] of typeMap.entries()) {
    const pct     = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const display = TYPE_DISPLAY[ct] ?? DEFAULT_DISPLAY;

    // Dominant importance: most frequent; ties broken by highest importance rank
    const counts = new Map<ImportanceLevel, number>();
    for (const lvl of levels) counts.set(lvl, (counts.get(lvl) ?? 0) + 1);
    const dominantImportance = Array.from(counts.entries())
      .sort((a, b) => b[1] !== a[1] ? b[1] - a[1] : IMPORTANCE_RANK[a[0]] - IMPORTANCE_RANK[b[0]])
      [0]?.[0] ?? "medium";

    byType[ct] = { canonicalType: ct, label: display.label, icon: display.icon, total, mastered, pct, dominantImportance };

    if (pct < WEAK_THRESHOLD)    weakTypes.push(ct);
    if (pct >= STRONG_THRESHOLD) strongTypes.push(ct);
  }

  weakTypes.sort((a, b)   => (byType[a]?.pct ?? 0) - (byType[b]?.pct ?? 0));
  strongTypes.sort((a, b) => (byType[b]?.pct ?? 0) - (byType[a]?.pct ?? 0));

  return {
    byType,
    overallPct:    units.length > 0 ? Math.round((totalMastered / units.length) * 100) : 0,
    totalUnits:    units.length,
    masteredUnits: totalMastered,
    weakTypes,
    strongTypes,
  };
}
